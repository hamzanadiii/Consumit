import { describe, expect, it } from 'vitest'
import { detectSubtitleFormat, normalizeSubtitleLanguage, normalizeSubtitleToVtt } from './subtitles.ts'

describe('subtitle normalizer', () => {
  it('converts SRT timestamps while leaving valid WebVTT untouched', () => {
    expect(normalizeSubtitleToVtt('1\r\n00:00:01,000 --> 00:00:02,000\r\nHello', 'srt')).toContain('00:00:01.000 --> 00:00:02.000')
    expect(normalizeSubtitleToVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello', 'vtt')).toContain('WEBVTT')
  })
  it('detects formats from content rather than labels', () => {
    expect(detectSubtitleFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000')).toBe('vtt')
    expect(detectSubtitleFormat('1\n00:00:01,000 --> 00:00:02,000\nHi')).toBe('srt')
    expect(detectSubtitleFormat('<html>error</html>')).toBe('unknown')
  })
  it('rejects error pages, invalid documents, bad encodings, and oversized payloads', () => {
    expect(() => normalizeSubtitleToVtt('<html>error</html>', 'vtt')).toThrow()
    expect(() => normalizeSubtitleToVtt('not captions', 'srt')).toThrow('Invalid SRT.')
    expect(() => normalizeSubtitleToVtt('no header', 'vtt')).toThrow('Invalid WebVTT.')
    expect(() => normalizeSubtitleToVtt('WEBVTT\0broken', 'vtt')).toThrow('encoding')
    expect(() => normalizeSubtitleToVtt('x'.repeat(2_000_001), 'vtt')).toThrow('size limit')
  })
  it('normalizes caption language tags with an English fallback', () => {
    expect(normalizeSubtitleLanguage('en')).toBe('en')
    expect(normalizeSubtitleLanguage('EN-us')).toBe('en-us')
    expect(normalizeSubtitleLanguage('not a language!!!')).toBe('en')
    expect(normalizeSubtitleLanguage(undefined)).toBe('en')
  })
})
