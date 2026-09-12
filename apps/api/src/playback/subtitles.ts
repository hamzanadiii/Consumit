/**
 * Dedicated subtitle normalizer. It owns format detection, encoding checks,
 * language metadata, validation, and SRT-to-WebVTT conversion for bounded
 * operator certification. Member playback accepts direct WebVTT only.
 */

export type SubtitleFormat = 'srt' | 'vtt'

const MAX_SUBTITLE_BYTES = 2_000_000

/** Detect a subtitle format from its content; never guess from a URL or label. */
export function detectSubtitleFormat(text: string): SubtitleFormat | 'unknown' {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (normalized.startsWith('WEBVTT')) return 'vtt'
  if (/\d{2}:\d{2}:\d{2},\d{3}\s+-->/.test(normalized)) return 'srt'
  return 'unknown'
}

/** Validate a BCP-47 style caption language tag; fall back to English. */
export function normalizeSubtitleLanguage(value: string | undefined): string {
  const candidate = (value ?? 'en').trim().slice(0, 32)
  if (/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(candidate)) return candidate.toLowerCase()
  return 'en'
}

function checked(text: string): string {
  if (text.length > MAX_SUBTITLE_BYTES) throw new Error('Subtitle exceeds the size limit.')
  if (text.includes('\u0000')) throw new Error('Invalid subtitle encoding.')
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (/^\s*</.test(normalized) || /<html[\s>]/i.test(normalized)) throw new Error('Invalid subtitle document.')
  return normalized
}

/**
 * Normalize a subtitle document to WebVTT. SRT timestamps are converted;
 * VTT documents are validated and passed through unchanged.
 */
export function normalizeSubtitleToVtt(text: string, format: SubtitleFormat): string {
  const normalized = checked(text)
  if (format === 'vtt') {
    if (!normalized.startsWith('WEBVTT')) throw new Error('Invalid WebVTT.')
    return normalized
  }
  if (!/\d{2}:\d{2}:\d{2},\d{3}\s+-->/.test(normalized)) throw new Error('Invalid SRT.')
  return `WEBVTT\n\n${normalized.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`
}
