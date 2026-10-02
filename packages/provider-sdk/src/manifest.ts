/**
 * Strict HLS playlist validation behind the provider seam.
 *
 * Moved from the API playback module so every adapter validates manifests
 * through one tokenizer instead of scattered regexes. Configured adapters
 * produce a narrow set of URI-bearing constructs: plain segment/variant URI
 * lines plus URI attributes on EXT-X-MEDIA, EXT-X-KEY, EXT-X-MAP, and
 * EXT-X-I-FRAME-STREAM-INF. Every other URI-bearing tag fails closed so an
 * upstream playlist can never smuggle an unreviewed reference through
 * validation. Unrestricted regex parsing is not used: attribute lists are
 * tokenized with quoted-string awareness.
 */

const URI_ATTRIBUTE_TAGS = new Set([
  'EXT-X-MEDIA',
  'EXT-X-KEY',
  'EXT-X-MAP',
  'EXT-X-I-FRAME-STREAM-INF',
])

type HlsLine =
  | { kind: 'empty' | 'comment' | 'tag'; raw: string }
  | { kind: 'uri'; raw: string; value: string }
  | { kind: 'tag-uri'; raw: string; tag: string; uri: string }

/** Split a tag attribute list into name/value pairs, respecting quoted strings. */
export function parseHlsAttributeList(input: string): Array<[string, string]> {
  const attributes: Array<[string, string]> = []
  let cursor = 0
  while (cursor < input.length) {
    while (cursor < input.length && /[\s,]/.test(input[cursor]!)) cursor++
    if (cursor >= input.length) break
    const name = /^[A-Za-z0-9_-]+/.exec(input.slice(cursor))?.[0]
    if (!name) throw new Error('Unsupported manifest URI attribute.')
    cursor += name.length
    if (input[cursor] !== '=') throw new Error('Unsupported manifest URI attribute.')
    cursor++
    let value: string
    if (input[cursor] === '"') {
      cursor++
      let decoded = ''
      let closed = false
      while (cursor < input.length) {
        const char = input[cursor]!
        if (char === '"') { closed = true; cursor++; break }
        decoded += char
        cursor++
      }
      if (!closed) throw new Error('Unsupported manifest URI attribute.')
      value = decoded
    } else {
      const raw = /^[^,]+/.exec(input.slice(cursor))?.[0] ?? ''
      const literal = raw.trim()
      if (!literal) throw new Error('Unsupported manifest URI attribute.')
      value = literal
      cursor += raw.length
    }
    attributes.push([name, value])
  }
  return attributes
}

function tagNameOf(line: string): string | undefined {
  const match = /^#([A-Za-z0-9-]+)/.exec(line)
  return match?.[1]
}

function tokenize(text: string): HlsLine[] {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS manifest.')
  // Unknown variable substitution and alternate content steering need their own validated adapter.
  if (/\{\$|#EXT-X-CONTENT-STEERING/.test(text)) throw new Error('Unsupported HLS manifest feature.')
  if (/#EXT-X-(DEFINE|IMPORT)\b/.test(text)) throw new Error('Unsupported HLS manifest feature.')
  return text.split(/\r?\n/).map((raw) => {
    const line = raw.trim()
    if (!line) return { kind: 'empty', raw } as HlsLine
    if (!line.startsWith('#')) return { kind: 'uri', raw, value: line } as HlsLine
    const tag = tagNameOf(line)
    const rest = line.slice(`#${tag ?? ''}`.length)
    // Unquoted URI attributes are never valid HLS.
    if (/\bURI=(?!")/.test(line)) throw new Error('Unsupported manifest URI attribute.')
    if (line.includes('URI="')) {
      if (!tag || !rest.startsWith(':') || !URI_ATTRIBUTE_TAGS.has(tag)) throw new Error('Unsupported manifest URI attribute.')
      const attributes = parseHlsAttributeList(rest.slice(1))
      const uri = attributes.find(([name]) => name === 'URI')?.[1]
      if (uri === undefined) throw new Error('Unsupported manifest URI attribute.')
      return { kind: 'tag-uri', raw, tag, uri } as HlsLine
    }
    // Value-only tags (EXTINF, TARGETDURATION, STREAM-INF) pass through untouched.
    return { kind: 'tag', raw } as HlsLine
  })
}

/**
 * Assert fetched text is a playable HLS manifest and classify it. Masters
 * carry variant ladders (`EXT-X-STREAM-INF`); media playlists carry segments
 * (`EXTINF`, `EXT-X-TARGETDURATION`, or `EXT-X-MEDIA-SEQUENCE`). Anything
 * else — HTML error pages, empty playlists, unsupported features — throws,
 * so callers fail closed. The seam skips the candidate; adapters translate
 * to `ProviderFailure('malformed')` to keep their contract codes.
 */
export function assertHlsManifest(text: string): 'master' | 'media' {
  const lines = tokenize(text)
  const tags: string[] = []
  for (const line of lines) if (line.kind === 'tag') tags.push(line.raw)
  if (tags.some((raw) => /^#EXT-X-STREAM-INF:/.test(raw))) return 'master'
  if (tags.some((raw) => /^#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE):/.test(raw) || /^#EXTINF:/.test(raw))) return 'media'
  throw new Error('Invalid HLS manifest.')
}

/**
 * Total media duration of an HLS media playlist, or undefined for multivariant
 * masters and empty playlists. Used to reject wrong-title content (a 3-minute
 * clip served as a 2-hour film) without any extra upstream fetch.
 */
export function sumMediaPlaylistDuration(text: string): number | undefined {
  const matches = [...text.matchAll(/#EXTINF:([\d.]+)/g)].map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0)
  if (!matches.length) return undefined
  return matches.reduce((total, value) => total + value, 0)
}

/**
 * Whether a media playlist timeline plausibly belongs to the expected title.
 * Shorts and unknown runtimes stay unenforced; anything else must clear both
 * a short-clip floor and a proportional floor, so a music video or trailer
 * can never stand in for a feature or episode. Enforcement needs the
 * expected runtime, which the seam does not have — adapters with catalog
 * metadata apply this where they can.
 */
export function isPlausibleManifestDuration(actualSec: number, expectedSec: number): boolean {
  if (!(expectedSec > 600)) return true
  if (actualSec < 300 && expectedSec >= 1500) return false
  if (actualSec < expectedSec * 0.2) return false
  return true
}

/**
 * Parse an HLS manifest and return its URI references in line order.
 * Resolution against the manifest URL happens here so validation shares
 * one tokenizer; callers deduplicate as needed.
 */
export function parseHlsReferences(text: string, baseUrl: string): string[] {
  return parseHlsReferenceEntries(text, baseUrl).map((entry) => entry.url)
}

/** Keep media-segment provenance for bounded seek checks. */
export function parseHlsReferenceEntries(text: string, baseUrl: string): Array<{ url: string; media: boolean }> {
  const lines = tokenize(text)
  const mediaPlaylist = lines.some((line) => line.kind === 'tag' && /^\s*#EXTINF:/.test(line.raw))
  const references: Array<{ url: string; media: boolean }> = []
  for (const line of lines) {
    if (line.kind === 'uri') references.push({ url: new URL(line.value, baseUrl).href, media: mediaPlaylist })
    else if (line.kind === 'tag-uri') references.push({ url: new URL(line.uri, baseUrl).href, media: line.tag === 'EXT-X-MAP' })
  }
  return references
}
