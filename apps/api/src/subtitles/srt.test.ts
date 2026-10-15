import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { langLabel, normLang } from './lang.ts'
import { decodeSubtitleText, srtToVtt, unzipEntries } from './srt.ts'

const SAMPLE_SRT = '﻿1\n00:00:01,000 --> 00:00:04,000\nHello <i>world</i>\n\n2\n00:00:05,500 --> 00:00:07,000\nSecond {an8}line\n'

describe('srtToVtt', () => {
  it('strips counters, fixes timestamps, and removes formatting tags', () => {
    const vtt = srtToVtt(SAMPLE_SRT)
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000')
    expect(vtt).toContain('Hello world')
    expect(vtt).toContain('Second line')
    expect(vtt).not.toContain('<i>')
  })

  it('skips blocks without a timestamp line', () => {
    expect(srtToVtt('note without cues\n\n1\n00:01,000 --> 00:02,000\nHi\n')).toContain('Hi')
  })
})

/** Minimal stored (uncompressed) zip builder for fixtures. */
function storedZip(files: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(0, 8)
    head.writeUInt32LE(file.data.length, 18)
    head.writeUInt32LE(file.data.length, 22)
    head.writeUInt16LE(name.length, 26)
    chunks.push(head, name, file.data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt32LE(file.data.length, 20)
    entry.writeUInt32LE(file.data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += 30 + name.length + file.data.length
  }
  const centralDir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, centralDir, eocd])
}

describe('unzipEntries', () => {
  it('extracts stored entries and rejects garbage', () => {
    const zip = storedZip([{ name: 'en.srt', data: Buffer.from(SAMPLE_SRT, 'utf8') }])
    const entries = unzipEntries(zip)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe('en.srt')
    expect(srtToVtt(entries[0]!.data.toString('utf8'))).toContain('WEBVTT')
    expect(() => unzipEntries(Buffer.from('not a zip'))).toThrow()
  })

  it('falls back to raw inflate for streams without a zlib wrapper', () => {
    // Real-world subtitle zips (e.g. YIFY) ship raw deflate entries that
    // inflateSync rejects; the raw fallback recovers them.
    const payload = Buffer.from(SAMPLE_SRT, 'utf8')
    const comp = deflateRawSync(payload)
    const name = Buffer.from('raw.srt', 'utf8')
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(8, 8)
    head.writeUInt32LE(comp.length, 18)
    head.writeUInt32LE(payload.length, 22)
    head.writeUInt16LE(name.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(comp.length, 20)
    entry.writeUInt32LE(payload.length, 24)
    entry.writeUInt16LE(name.length, 28)
    const off = 30 + name.length + comp.length
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(46 + name.length, 12)
    eocd.writeUInt32LE(off, 16)
    const zip = Buffer.concat([head, name, comp, entry, name, eocd])
    const entries = unzipEntries(zip)
    expect(entries).toHaveLength(1)
    expect(srtToVtt(entries[0]!.data.toString('utf8'))).toContain('WEBVTT')
  })

  /** Raw-deflate zip builder (method 8), mirroring the fallback fixture. */
  function deflatedZip(files: { name: string; data: Buffer }[]): Buffer {
    const chunks: Buffer[] = []
    const central: Buffer[] = []
    let offset = 0
    for (const file of files) {
      const comp = deflateRawSync(file.data)
      const name = Buffer.from(file.name, 'utf8')
      const head = Buffer.alloc(30)
      head.writeUInt32LE(0x04034b50, 0)
      head.writeUInt16LE(8, 8)
      head.writeUInt32LE(comp.length, 18)
      head.writeUInt32LE(file.data.length, 22)
      head.writeUInt16LE(name.length, 26)
      chunks.push(head, name, comp)
      const entry = Buffer.alloc(46)
      entry.writeUInt32LE(0x02014b50, 0)
      entry.writeUInt16LE(8, 10)
      entry.writeUInt32LE(comp.length, 20)
      entry.writeUInt32LE(file.data.length, 24)
      entry.writeUInt16LE(name.length, 28)
      entry.writeUInt32LE(offset, 42)
      central.push(entry, name)
      offset += 30 + name.length + comp.length
    }
    const centralDir = Buffer.concat(central)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(files.length, 10)
    eocd.writeUInt32LE(centralDir.length, 12)
    eocd.writeUInt32LE(offset, 16)
    return Buffer.concat([...chunks, centralDir, eocd])
  }

  it('skips a single entry whose inflated size exceeds the per-entry cap', () => {
    // 9 MiB of zeros deflates to a few KiB; without the cap the tiny
    // archive would expand without bound during extraction.
    const zip = deflatedZip([{ name: 'bomb.vtt', data: Buffer.alloc(9 * 1024 * 1024) }])
    expect(unzipEntries(zip)).toHaveLength(0)
  })

  it('throws when stored entries expand past the cumulative cap', () => {
    const big = Buffer.alloc(9 * 1024 * 1024)
    expect(() => unzipEntries(storedZip([
      { name: 'a.srt', data: big },
      { name: 'b.srt', data: big },
    ]))).toThrow('expands beyond its limit')
  })

  it('caps the number of extracted entries', () => {
    const files = Array.from({ length: 600 }, (_, index) => ({ name: `f${index}.srt`, data: Buffer.from('x') }))
    expect(unzipEntries(storedZip(files))).toHaveLength(512)
  })
})

describe('decodeSubtitleText', () => {
  it('passes valid UTF-8 through untouched, including Arabic', () => {
    const text = '1\n00:00:01,000 --> 00:00:04,000\nHello مرحبا\n'
    expect(decodeSubtitleText(Buffer.from(text, 'utf8'))).toBe(text)
  })

  it('strips a UTF-8 BOM', () => {
    const decoded = decodeSubtitleText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('WEBVTT', 'utf8')]))
    expect(decoded).toBe('WEBVTT')
  })

  it('decodes Windows-1256 Arabic instead of emitting replacement tofu', () => {
    // "مرحبا" in Windows-1256: م ر ح ب ا. Strict UTF-8 rejects these
    // bytes; lenient UTF-8 would bake one U+FFFD per letter.
    const word = Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7])
    const srt = Buffer.concat([
      Buffer.from('1\n00:00:01,000 --> 00:00:04,000\n', 'utf8'),
      word, Buffer.from(' ', 'utf8'), word, Buffer.from(' ', 'utf8'), word, Buffer.from('\n', 'utf8'),
    ])
    const decoded = decodeSubtitleText(srt)
    expect(decoded).toContain('مرحبا')
    expect(decoded).not.toContain('\uFFFD')
    expect(srtToVtt(decoded)).toContain('مرحبا')
  })

  it('decodes accent-dense Windows-1252 French instead of tofu', () => {
    // "café crème brûlée" in Windows-1252: é=0xE9 è=0xE8 û=0xFB.
    // Repeated for accent density: sparse strays stay lenient-UTF-8.
    const words = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x63, 0x72, 0xe8, 0x6d, 0x65, 0x20, 0x62, 0x72, 0xfb, 0x6c, 0xe9, 0x65, 0x20])
    const srt = Buffer.concat([
      Buffer.from('1\n00:00:01,000 --> 00:00:04,000\n', 'utf8'),
      words, words, words, words, Buffer.from('\n', 'utf8'),
    ])
    const decoded = decodeSubtitleText(srt)
    expect(decoded).toContain('café')
    expect(decoded).toContain('brûlée')
    expect(decoded).not.toContain('\uFFFD')
  })

  it('decodes sparse Windows-1252 French without tofu', () => {
    // One legacy û (0xFB) in otherwise plain ASCII: the old lenient
    // threshold kept it as U+FFFD ("S�rement"). No valid multi-byte UTF-8
    // run exists, so the clean Windows-1252 decode must win.
    const srt = Buffer.concat([
      Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nS', 'utf8'),
      Buffer.from([0xfb]),
      Buffer.from('rement quelque chose de surprenant.\n', 'utf8'),
    ])
    const decoded = decodeSubtitleText(srt)
    expect(decoded).toContain('Sûrement')
    expect(decoded).not.toContain('\uFFFD')
  })

  it('keeps valid UTF-8 runs when only stray bytes are present', () => {
    const buf = Buffer.concat([Buffer.from('héllo ', 'utf8'), Buffer.from([0x92]), Buffer.from(' world', 'utf8')])
    const decoded = decodeSubtitleText(buf)
    expect(decoded).toContain('héllo')
    expect(decoded).not.toContain('Ã©')
  })
})

describe('language tables', () => {
  it('normalizes names and passes known codes through', () => {
    expect(normLang('Brazilian Portuguese')).toBe('pt')
    expect(normLang('EN')).toBe('en')
    expect(normLang('fr')).toBe('fr')
    expect(normLang('Klingon')).toBe('en')
    expect(langLabel('en')).toBe('English')
  })

  it('maps parenthesized and regional variants to the base language', () => {
    // VDRK ships "Spanish (LA)"; the old fallback mislabeled it as English,
    // grouping the track under the wrong menu language.
    expect(normLang('Spanish (LA)')).toBe('es')
    expect(normLang('Portuguese (BR)')).toBe('pt')
    expect(normLang('English (US)')).toBe('en')
    expect(normLang('es-419')).toBe('es')
    expect(normLang('pt_BR')).toBe('pt')
  })
})
