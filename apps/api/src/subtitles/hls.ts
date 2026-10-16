import { allowedMediaUrl, assertHlsManifest, parseHlsReferences, type ProviderRegistration } from '@consumit/provider-sdk'
import { fetchSubtitleBytes } from './http.ts'
import { decodeSubtitleText } from './srt.ts'
import type { RawSubtitle } from './types.ts'

const MAX_BYTES = 5_242_880
const MAX_SEGMENTS = 512
const timestamp = (value: string) => value.split(':').reduce((total, part) => total * 60 + Number(part), 0)
function clock(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000))
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

/** Export finite, unencrypted WebVTT playlists through the existing file store. */
export async function downloadStreamingSubtitle(raw: RawSubtitle, registration: ProviderRegistration, signal: AbortSignal): Promise<Buffer> {
  const safe = (url: string) => allowedMediaUrl(url, registration.mediaHosts, registration.mediaHostPatterns)
  let bytes = 0
  async function read(url: string, maxBytes = MAX_BYTES) {
    if (!safe(url)) throw new Error('Unconfigured subtitle destination.')
    const sameHost = new URL(url).hostname === new URL(raw.url).hostname
    const headers = sameHost ? raw.headers ?? {} : Object.fromEntries(Object.entries(raw.headers ?? {}).filter(([key]) => !/^(cookie|authorization)$/i.test(key)))
    const result = await fetchSubtitleBytes(url, registration.mediaHosts, headers, signal, Math.min(maxBytes, Math.max(1, MAX_BYTES - bytes)), registration.mediaHostPatterns)
    bytes += result.length
    if (bytes > MAX_BYTES) throw new Error('Subtitle playlist exceeds its limit.')
    return result
  }
  const root = await read(raw.url, raw.hls ? 131072 : MAX_BYTES)
  if (!raw.hls) return root
  const text = decodeSubtitleText(root).replace(/\r\n?/g, '\n')
  if (text.replace(/^\uFEFF/, '').startsWith('WEBVTT')) return root
  if (assertHlsManifest(text) !== 'media' || !text.includes('#EXT-X-ENDLIST') || /#EXT-X-(?:KEY|MAP|DISCONTINUITY|BYTERANGE)(?::|\n)/.test(text)) throw new Error('Unsupported subtitle timeline.')
  if (parseHlsReferences(text, raw.url).some(url => !safe(url))) throw new Error('Unconfigured subtitle destination.')
  let start = 0, duration = 0
  const segments: { url: string; start: number; duration: number }[] = []
  for (const line of text.split('\n').map(line => line.trim())) {
    if (line.startsWith('#EXTINF:')) duration = Number.parseFloat(line.slice(8))
    else if (line && !line.startsWith('#')) {
      if (!Number.isFinite(duration) || duration <= 0 || start + duration > 86400 || segments.length >= MAX_SEGMENTS) throw new Error('Unsupported subtitle timeline.')
      segments.push({ url: new URL(line, raw.url).href, start, duration })
      start += duration; duration = 0
    }
  }
  if (!segments.length) throw new Error('Empty subtitle playlist.')
  // Four file requests at once, with one shared byte and wall-clock budget.
  const documents = new Array<string>(segments.length)
  let index = 0
  await Promise.all(Array.from({ length: Math.min(4, segments.length) }, async () => {
    while (index < segments.length) {
      signal.throwIfAborted()
      const current = index++
      documents[current] = decodeSubtitleText(await read(segments[current]!.url, 262144)).replace(/\r\n?/g, '\n')
    }
  }))
  const cues: { start: number; end: number; text: string }[] = []
  let firstMap: number | undefined
  const seen = new Set<string>()
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i]!, segment = segments[i]!
    if (!document.replace(/^\uFEFF/, '').startsWith('WEBVTT')) throw new Error('Invalid subtitle segment.')
    const map = document.match(/X-TIMESTAMP-MAP=([^\n]+)/)?.[1]
    const local = map?.match(/LOCAL:([\d:.]+)/)?.[1], mpeg = map?.match(/MPEGTS:(\d+)/)?.[1]
    let offset = 0
    if (map) {
      if (!local || !mpeg || !Number.isFinite(timestamp(local)) || timestamp(local) > 86400 || !Number.isFinite(Number(mpeg)) || Number(mpeg) >= 2 ** 33) throw new Error('Invalid subtitle clock.')
      let mapped = Number(mpeg) / 90000 - timestamp(local)
      firstMap ??= mapped
      // MPEG clocks wrap at 33 bits. Keep the same VOD clock across it.
      const wrap = 2 ** 33 / 90000
      while (mapped - firstMap < -wrap / 2) mapped += wrap
      while (mapped - firstMap > wrap / 2) mapped -= wrap
      offset = mapped - firstMap
    }
    for (const block of document.split(/\n\s*\n/)) {
      if (/^(?:WEBVTT|NOTE|STYLE|REGION)/.test(block.trim())) continue
      const lines = block.trim().split('\n')
      const timingIndex = lines.findIndex(line => line.includes('-->'))
      const timing = lines[timingIndex]?.match(/^((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})(?:\s|$)/)
      if (!timing) continue
      const from = timestamp(timing[1]!), to = timestamp(timing[2]!)
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue
      if (!map && i > 0 && to < segment.start - segment.duration) throw new Error('Subtitle segments need a clock map.')
      const body = lines.slice(timingIndex + 1).join('\n').trim()
      if (!body) continue
      const cue = { start: Math.max(0, from + offset), end: to + offset, text: body }
      if (cue.end <= cue.start || cue.end > 86400) continue
      const key = JSON.stringify(cue)
      if (seen.has(key)) continue
      seen.add(key); cues.push(cue)
      if (cues.length > 50000) throw new Error('Too many subtitle cues.')
    }
  }
  if (!cues.length) throw new Error('Subtitle playlist has no usable cues.')
  const vtt = Buffer.from('WEBVTT\n\n' + cues.sort((a, b) => a.start - b.start).map(cue => `${clock(cue.start)} --> ${clock(cue.end)}\n${cue.text}`).join('\n\n'))
  if (vtt.length > 524288) throw new Error('Subtitle file exceeds its limit.')
  return vtt
}
