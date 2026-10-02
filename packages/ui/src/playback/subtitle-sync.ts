/**
 * Subtitle sync engine ported from the previous Consumit player: VTT cue
 * parsing, delay-shifted cue lookup, and click-to-sync delay math.
 *
 * Delay semantics (unchanged from the old player): `delayMs` shifts the
 * subtitle track forward — the cue shown at playback time `t` is the one
 * containing `t + delayMs / 1000`. Positive delay shows later cues sooner.
 */

export type SubtitleCue = {
  startTime: number
  endTime: number
  text: string
}

const MAX_SUBTITLE_CHARS = 2 * 1024 * 1024
const MAX_LINES = 80_000
const MAX_CUES = 20_000
const MAX_CUE_TEXT_CHARS = 1_200
const MAX_FETCH_BYTES = 2 * 1024 * 1024

export const SUBTITLE_DELAY_KEY = 'consumit.player.subtitle-delay'
export const MAX_SUBTITLE_DELAY_MS = 30_000

/** Reaction compensation the old HUD applied: while playing, the member
 *  hears a line, reacts, and clicks ~350ms later, so the audio moment sits
 *  350ms before the click. Paused clicks need no compensation. */
export const SYNC_REACTION_COMPENSATION_S = 0.35

function parseTimestamp(value: string): number {
  const parts = value.split(':').reverse()
  let seconds = 0
  const secParts = (parts[0] ?? '').replace(',', '.').split('.')
  seconds += Number.parseInt(secParts[0] ?? '0', 10) + (Number.parseInt(secParts[1] ?? '0', 10) || 0) / 1000
  if (parts[1]) seconds += Number.parseInt(parts[1], 10) * 60
  if (parts[2]) seconds += Number.parseInt(parts[2], 10) * 3600
  return seconds
}

function sanitizeCueText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseVttCues(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const safeContent = content.length > MAX_SUBTITLE_CHARS ? content.slice(0, MAX_SUBTITLE_CHARS) : content
  const lines = safeContent.replace(/\r\n/g, '\n').split('\n')
  let current: { startTime: number; endTime: number; text: string } | null = null
  const limit = Math.min(lines.length, MAX_LINES)
  for (let i = 0; i < limit; i++) {
    if (cues.length >= MAX_CUES) break
    const line = (lines[i] ?? '').trim()
    if (!line) continue
    if (line.includes('-->')) {
      if (current) cues.push(current)
      const parts = line.split('-->').map((part) => part.trim())
      const startTime = parseTimestamp(parts[0] ?? '')
      const endTime = parseTimestamp(parts[1] ?? '')
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        current = null
        continue
      }
      current = { startTime, endTime, text: '' }
    } else if (current && Number.isNaN(Number(line)) && !line.startsWith('WEBVTT') && !line.startsWith('NOTE')) {
      const clean = sanitizeCueText(line)
      if (clean) {
        const next = current.text ? `${current.text}\n${clean}` : clean
        current.text = next.slice(0, MAX_CUE_TEXT_CHARS)
      }
    }
  }
  if (current) cues.push(current)
  return cues.filter((cue) => cue.text.length > 0)
}

/** Binary-search cue lookup. Returns every cue containing `time` so
 *  overlapping lines join the same way the native-cue path does. */
export function findCuesAt(cues: readonly SubtitleCue[], time: number): SubtitleCue[] {
  if (cues.length === 0) return []
  let low = 0
  let high = cues.length - 1
  let candidate = -1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const cue = cues[mid]!
    if (cue.startTime > time) {
      high = mid - 1
    } else {
      candidate = mid
      low = mid + 1
    }
  }
  if (candidate === -1) return []
  const found: SubtitleCue[] = []
  for (let i = candidate; i >= 0; i--) {
    const cue = cues[i]!
    if (cue.endTime < time) break
    if (cue.startTime <= time) found.unshift(cue)
  }
  return found
}

/** Render text for playback time `t` with the member's sync offset applied. */
export function cueTextAt(cues: readonly SubtitleCue[], time: number, delayMs: number): string {
  return findCuesAt(cues, time + delayMs / 1000)
    .map((cue) => cue.text)
    .filter(Boolean)
    .join('\n')
}

/**
 * Click-to-sync math from the old HUD: the member clicks the cue line the
 * moment they hear it spoken, and the offset is solved so that cue starts
 * exactly at the (reaction-compensated) click time.
 */
export function computeSyncDelayMs(cueStartTime: number, clickTime: number, isPlaying: boolean): number {
  const trueAudioTime = clickTime - (isPlaying ? SYNC_REACTION_COMPENSATION_S : 0)
  return Math.round((cueStartTime - trueAudioTime) * 1000)
}

/**
 * Native language display name for a subtitle menu row, PROVE-embed style
 * ("العربية", "English", "Español", …). Resolves the code in its own locale
 * so the name renders natively; falls back to the supplied label when the
 * code is missing or the runtime lacks full ICU.
 */
export function nativeLanguageName(code: string | undefined, fallback: string): string {
  const clean = (code ?? '').trim()
  if (!clean) return fallback
  try {
    const base = clean.split('-')[0]!.toLowerCase()
    const name = new Intl.DisplayNames([base], { type: 'language' }).of(base)
    if (name) return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    /* runtime without full ICU: fall through to the label */
  }
  return fallback
}

/**
 * Member-chosen subtitle languages, in priority order (max 3). The engine
 * tries these first from every subtitle provider; the first also drives
 * track auto-select on the next mount. Device-local like every other
 * player preference.
 */
export const SUBTITLE_LANGUAGES_KEY = 'consumit.player.subtitle-languages'
export const SUBTITLE_LANGUAGES_EVENT = 'consumit:subtitle-languages-changed'
export const MAX_SUBTITLE_LANGUAGES = 3

/** Curated picker list; rows render natively via nativeLanguageName. */
export const PREFERRED_LANGUAGE_CODES: readonly string[] = [
  'en', 'ar', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'hi',
  'tr', 'nl', 'pl', 'uk', 'fa', 'he', 'id', 'ms', 'ur',
]

export function cleanSubtitleLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const code = entry.trim().toLowerCase()
    if (!/^[a-z]{2,3}$/.test(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
    if (out.length >= MAX_SUBTITLE_LANGUAGES) break
  }
  return out
}

export function readStoredSubtitleLanguages(): string[] {
  try {
    const raw = window.localStorage.getItem(SUBTITLE_LANGUAGES_KEY)
    if (raw == null) return []
    return cleanSubtitleLanguages(JSON.parse(raw))
  } catch {
    return []
  }
}

/**
 * Shared write path for preferred subtitle languages (player menu and
 * Settings use the same contract): persist, notify live watch screens,
 * and point track auto-select at the first language.
 */
export function savePreferredSubtitleLanguages(next: readonly string[]): string[] {
  const clean = storeSubtitleLanguages(next)
  if (clean[0]) {
    try {
      window.localStorage.setItem('consumit.player.subtitle-language', clean[0])
    } catch {
      /* private-mode storage must never break playback */
    }
  }
  return clean
}

export function storeSubtitleLanguages(langs: readonly string[]): string[] {
  const clean = cleanSubtitleLanguages(langs)
  try {
    window.localStorage.setItem(SUBTITLE_LANGUAGES_KEY, JSON.stringify(clean))
  } catch {
    /* private-mode storage must never break playback */
  }
  try {
    window.dispatchEvent(new Event(SUBTITLE_LANGUAGES_EVENT))
  } catch {
    /* eventing is best-effort */
  }
  return clean
}

export function clampSubtitleDelayMs(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(MAX_SUBTITLE_DELAY_MS, Math.max(-MAX_SUBTITLE_DELAY_MS, Math.round(value)))
}

export function readStoredSubtitleDelayMs(): number {
  try {
    const raw = window.localStorage.getItem(SUBTITLE_DELAY_KEY)
    if (raw == null) return 0
    return clampSubtitleDelayMs(Number(raw))
  } catch {
    return 0
  }
}

export function formatSubtitleDelayMs(delayMs: number): string {
  if (delayMs === 0) return '0ms'
  return delayMs > 0 ? `+${delayMs}ms` : `${delayMs}ms`
}

/** Bounded VTT download for the sync path. Served first-party files are
 *  same-origin; working upstream tracks are CORS-open by necessity (plain
 *  `<track>` elements refuse cross-origin cues otherwise). Anything else
 *  fails and the caller falls back to native cue timing. */
export async function fetchVttCues(url: string, signal: AbortSignal): Promise<SubtitleCue[]> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url, window.location.href)
  } catch {
    throw new Error('Subtitle file URL invalid.')
  }
  const localUpload = parsedUrl.protocol === 'blob:' && parsedUrl.origin === window.location.origin
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:' && !localUpload) throw new Error('Subtitle file URL unsupported.')
  const response = await fetch(parsedUrl.href, { credentials: 'same-origin', signal })
  if (!response.ok) throw new Error(`Subtitle file HTTP ${response.status}.`)
  const reader = response.body?.getReader()
  if (!reader) {
    const text = await response.text()
    if (text.length > MAX_FETCH_BYTES) throw new Error('Subtitle file too large.')
    return parseVttCues(text)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_FETCH_BYTES) {
      try {
        await reader.cancel()
      } catch {
        /* cancellation is best-effort */
      }
      throw new Error('Subtitle file too large.')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return parseVttCues(new TextDecoder().decode(merged))
}
