import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://rozgarlelo.modiplay.xyz'
const baseHeaders = { 'user-agent': userAgent, accept: 'text/html,*/*', referer: `${apiOrigin}/` }

function unescapeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/\\\//g, '/')
}

/** Port of the supplied Modiplay recipe (StreamHG/vibuxer backend): a
 *  two-hop static scrape (embed page, then proxy.php player page) yielding
 *  the browser-facing manifest path plus track subtitles. Raw vibuxer URLs are
 *  hotlink-locked, so only the browser-facing manifest becomes a source. No scripts
 *  are executed; matches are plain regexes over page text. */
export function createModiplayProvider(http: ProviderHttp, now = Date.now) {
  return adapter('modiplay', async (input, signal) => {
    const { ref } = input
    const embedUrl = ref.kind === 'movie'
      ? `${apiOrigin}/embed/tmdb/movie?id=${encodeURIComponent(String(ref.id))}`
      : `${apiOrigin}/embed/tmdb/tv?id=${encodeURIComponent(String(ref.id))}&s=${ref.season}&e=${ref.episode}`
    const embed = await document(http, embedUrl, signal, baseHeaders)
    const iframe = unescapeHtml(embed.text).match(/<iframe[^>]*src="([^"]*proxy\.php[^"]*)"/i)?.[1]
    if (!iframe) throw new ProviderFailure('empty')
    const playerUrl = iframe.startsWith('http') ? iframe : `${apiOrigin}${iframe.startsWith('/') ? '' : '/'}${iframe}`
    const player = await document(http, playerUrl, signal, { ...baseHeaders, referer: embedUrl })
    const html = unescapeHtml(player.text)
    const manifestPath = html.match(/var src="([^"]+)"/)?.[1]
    const directSrc = html.match(/var directSrc="([^"]+)"/)?.[1]
    let manifest = manifestPath ?? ''
    if (!manifest && directSrc) {
      // Fallback: rebuild the manifest endpoint from the raw vibuxer URL.
      const raw = unescapeHtml(directSrc)
      const host = raw.match(/^(https?:\/\/[^/]+)(\/stream\/.*)$/i)
      if (host) {
        manifest = `${apiOrigin}/proxy.php?serve_m3u8=1&ref=${encodeURIComponent(playerUrl)}&url=${encodeURIComponent(raw)}&ebd=${encodeURIComponent(host[1]!)}`
      }
    }
    if (!manifest) throw new ProviderFailure('empty')
    const url = manifest.startsWith('http') ? manifest : `${apiOrigin}${manifest.startsWith('/') ? '' : '/'}${manifest}`
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new ProviderFailure('malformed') }
    if (parsed.protocol !== 'https:') throw new ProviderFailure('malformed')
    let deadline: string
    try { deadline = accessDeadline(url, now()) } catch { throw new ProviderFailure('empty') }
    const seenSubs = new Set<string>()
    const subtitles: ProviderSource['subtitles'] = []
    for (const match of html.matchAll(/<track[^>]*src="([^"]+)"[^>]*label="([^"]*)"/gi)) {
      let track = unescapeHtml(match[1]!)
      if (track.startsWith('/')) track = `${apiOrigin}${track}`
      let parsedTrack: URL
      try { parsedTrack = new URL(track) } catch { continue }
      if (parsedTrack.protocol !== 'https:' || seenSubs.has(track)) continue
      seenSubs.add(track)
      const label = (match[2] || 'Unknown').slice(0, 64)
      subtitles.push({ id: `modiplay-sub-${subtitles.length}`, label, language: label.slice(0, 32),
        url: track, format: /\.srt/i.test(track) ? 'srt' : 'vtt' })
      if (subtitles.length >= 20) break
    }
    const source: ProviderSource = { key: 'modiplay:streamhg:0', url, type: 'hls',
      headers: { referer: playerUrl, 'user-agent': userAgent },
      expiresAt: deadline, language: 'original', qualityHint: 'Auto', subtitles }
    return [source]
  })
}
