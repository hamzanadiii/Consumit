export type EmbedQuery = {
  autoPlay: boolean
  /** Preferred caption language (BCP-47-ish). Absent when unset or invalid. */
  lang: string | undefined
  /** Resume offset in whole seconds from `startAt`. */
  startAt: number
}

const LANG_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i
const MAX_START_AT_SECONDS = 7 * 24 * 60 * 60

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** VixSrc-style embed query surface: `autoplay`, `startAt`, `lang`.
 *  Invalid values fall back to safe defaults; they never reach the player. */
export function parseEmbedQuery(raw: Record<string, string | string[] | undefined>): EmbedQuery {
  const autoplayRaw = first(raw.autoplay)?.trim().toLowerCase()
  const autoPlay = autoplayRaw == null || autoplayRaw === '' ? true : autoplayRaw !== 'false' && autoplayRaw !== '0'

  const startRaw = Number(first(raw.startAt))
  const startAt = Number.isFinite(startRaw) && startRaw > 0
    ? Math.min(Math.floor(startRaw), MAX_START_AT_SECONDS)
    : 0

  const langRaw = first(raw.lang)?.trim()
  const lang = langRaw && langRaw.length <= 16 && LANG_PATTERN.test(langRaw) ? langRaw.toLowerCase() : undefined

  return { autoPlay, lang, startAt }
}
