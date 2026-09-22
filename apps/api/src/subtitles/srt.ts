import { inflateRawSync, inflateSync } from 'node:zlib'

/** Legacy single-byte decoders, hoisted: subtitle files are small but every
 *  candidate decodes on the hot path. The casts are type-only: the runtime
 *  decodes every WHATWG label (verified for windows-1256/1252) while the
 *  bundled TextDecoder types enumerate a subset. */
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true })
const UTF8_LENIENT = new TextDecoder('utf-8')
const WINDOWS_1256 = new TextDecoder('windows-1256' as 'utf-8')
const WINDOWS_1252 = new TextDecoder('windows-1252' as 'utf-8')

const ARABIC_SCRIPT = /[\u0590-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g

/** Trust a windows-1256 decode only with real Arabic density: Western
 *  European bytes (é, è, à, ...) overlap the same 0xC0-0xFF range, so a
 *  bare count would misread accent-heavy French as Arabic. */
const MIN_ARABIC_CHARS = 8
const MIN_ARABIC_RATIO = 0.15

/**
 * Decode raw subtitle bytes to text. UTF-8 stays the default; Arabic
 * releases in the wild are overwhelmingly Windows-1256, which strict UTF-8
 * rejects outright (lenient decoding would bake one U+FFFD per letter —
 * the `"� � �"` tofu members see). Legacy Western European files fall back
 * to Windows-1252, while mostly-valid UTF-8 with stray bytes keeps its
 * valid runs instead of being re-decoded wholesale.
 */
export function decodeSubtitleText(buf: Buffer): string {
  let bytes: Buffer = buf
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3)
  try {
    return UTF8_STRICT.decode(bytes)
  } catch {
    /* Not valid UTF-8: fall through to legacy detection. */
  }
  const as1256 = WINDOWS_1256.decode(bytes)
  const arabic = as1256.match(ARABIC_SCRIPT)?.length ?? 0
  if (arabic >= MIN_ARABIC_CHARS && arabic / Math.max(1, as1256.length) >= MIN_ARABIC_RATIO) return as1256
  const lenient = UTF8_LENIENT.decode(bytes)
  const bad = (lenient.match(/\uFFFD/g) ?? []).length
  if (bad <= Math.max(3, lenient.length * 0.01)) return lenient
  return WINDOWS_1252.decode(bytes)
}

/** SRT to WebVTT conversion ported from the PROVE subtitle engine. Browser
 *  `<track>` elements render WebVTT only, so every fetched caption file is
 *  normalized here before it is cached and served. ASS/SSA styling is
 *  unsupported and skipped by the caller. */

export function srtToVtt(srt: string): string {
  const text = srt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  const out: string[] = ['WEBVTT', '']
  for (const block of blocks) {
    const lines = block.split('\n')
    // Strip the leading numeric counter.
    if (/^\d+$/.test(lines[0]!.trim())) lines.shift()
    if (!lines.length) continue
    // Timestamp line: 00:00:01,000 --> 00:00:04,000
    lines[0] = lines[0]!.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    if (!/-->/.test(lines[0]!)) continue
    // Strip simple formatting tags browsers choke on.
    const body = lines.slice(1).map((line) => line.replace(/<\/?[bius][^>]*>/gi, '').replace(/\{[^}]*\}/g, ''))
    out.push(lines[0]!, ...body, '')
  }
  return out.join('\n')
}

/** Minimal zip extraction (stored + deflated entries) ported from PROVE, so
 *  subtitle archives need no new dependency. Throws on malformed input. */
export function unzipEntries(buffer: Buffer): { name: string; data: Buffer }[] {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('Not a zip archive.')
  // Find the end-of-central-directory record.
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Zip directory not found.')
  const count = buffer.readUInt16LE(eocd + 10)
  let central = buffer.readUInt32LE(eocd + 16)
  const out: { name: string; data: Buffer }[] = []
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(central) !== 0x02014b50) break
    const method = buffer.readUInt16LE(central + 10)
    const compSize = buffer.readUInt32LE(central + 20)
    const nameLen = buffer.readUInt16LE(central + 28)
    const extraLen = buffer.readUInt16LE(central + 30)
    const commentLen = buffer.readUInt16LE(central + 32)
    const headerOff = buffer.readUInt32LE(central + 42)
    const name = buffer.subarray(central + 46, central + 46 + nameLen).toString('utf-8')
    central += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    const fnLen = buffer.readUInt16LE(headerOff + 26)
    const fExtra = buffer.readUInt16LE(headerOff + 28)
    const start = headerOff + 30 + fnLen + fExtra
    const comp = buffer.subarray(start, start + compSize)
    let data: Buffer | null = null
    if (method === 0) {
      data = Buffer.from(comp)
    } else if (method === 8) {
      try {
        data = Buffer.from(inflateSync(comp))
      } catch {
        try {
          data = Buffer.from(inflateRawSync(comp))
        } catch {
          data = null
        }
      }
    }
    if (data) out.push({ name, data: Buffer.from(data) })
  }
  return out
}
