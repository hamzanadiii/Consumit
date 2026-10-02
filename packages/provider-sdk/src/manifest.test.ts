import { describe, expect, it } from 'vitest'
import { assertHlsManifest, isPlausibleManifestDuration, parseHlsAttributeList, parseHlsReferences, sumMediaPlaylistDuration } from './manifest.ts'

const base = 'https://media.example/master.m3u8'
const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8'
const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'

describe('hls parser/tokenizer', () => {
  it('collects plain URI lines and allowlisted URI attributes in line order', () => {
    expect(parseHlsReferences(master, base)).toEqual([
      'https://media.example/audio.m3u8',
      'https://media.example/video.m3u8',
    ])
  })
  it('parses quoted values containing commas', () => {
    expect(parseHlsAttributeList('TYPE=AUDIO,GROUP-ID="a,b",URI="x.m3u8"')).toEqual([['TYPE', 'AUDIO'], ['GROUP-ID', 'a,b'], ['URI', 'x.m3u8']])
  })
  it('rejects non-manifests, variable substitution, steering, and define/import', () => {
    expect(() => parseHlsReferences('not a playlist', base)).toThrow('Invalid HLS manifest.')
    for (const text of [
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,URI="{$Base}/v.m3u8"\nvideo.m3u8',
      '#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.example"',
      '#EXTM3U\n#EXT-X-DEFINE:NAME="a",VALUE="b"',
    ]) expect(() => parseHlsReferences(text, base)).toThrow('Unsupported HLS manifest feature.')
  })
  it('sums media timelines and leaves masters without timelines undefined', () => {
    expect(sumMediaPlaylistDuration('#EXTM3U\n#EXTINF:8.0,\nseg-0.ts\n#EXTINF:6.5,\nseg-1.ts')).toBeCloseTo(14.5)
    expect(sumMediaPlaylistDuration(master)).toBeUndefined()
    expect(sumMediaPlaylistDuration('#EXTM3U\n#EXT-X-TARGETDURATION:6')).toBeUndefined()
  })
  it('rejects clips served as features while leaving shorts and close cuts alone', () => {
    expect(isPlausibleManifestDuration(272, 9000)).toBe(false)
    expect(isPlausibleManifestDuration(150, 9000)).toBe(false)
    expect(isPlausibleManifestDuration(2600, 2700)).toBe(true)
    expect(isPlausibleManifestDuration(500, 1200)).toBe(true)
    expect(isPlausibleManifestDuration(100, 500)).toBe(true)
  })
  it('fails closed on unquoted URIs and URI attributes outside the allowlist', () => {
    expect(() => parseHlsReferences('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=key.bin', base)).toThrow('Unsupported manifest URI attribute.')
    expect(() => parseHlsReferences('#EXTM3U\n#EXT-X-SESSION-DATA:DATA-ID="x",URI="data.json"', base)).toThrow('Unsupported manifest URI attribute.')
    expect(() => parseHlsAttributeList('URI="unterminated')).toThrow('Unsupported manifest URI attribute.')
  })
})

describe('assertHlsManifest', () => {
  it('classifies masters and media playlists', () => {
    expect(assertHlsManifest(master)).toBe('master')
    expect(assertHlsManifest(media)).toBe('media')
  })
  it('fails closed on error pages, empty playlists, and unsupported features', () => {
    expect(() => assertHlsManifest('<html>provider error</html>')).toThrow('Invalid HLS manifest.')
    expect(() => assertHlsManifest('#EXTM3U\n#EXT-X-VERSION:3\n')).toThrow('Invalid HLS manifest.')
    expect(() => assertHlsManifest('#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.example"')).toThrow('Unsupported HLS manifest feature.')
    expect(() => assertHlsManifest('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=key.bin\n#EXTINF:6,\nseg.ts')).toThrow('Unsupported manifest URI attribute.')
  })
})
