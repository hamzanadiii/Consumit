import { expect, it } from 'vitest'
import { vttSubtitlePlaylist } from './vtt-playlist-loader'

const url = 'https://media.example/subtitles/english.vtt?token=fixture'
it('wraps full VTT as one VOD segment using its last cue end', () => {
  const text = '\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:04.250\nFirst\n\n00:01:10.000 --> 00:01:12.500 align:start\nLast\n'
  expect(vttSubtitlePlaylist(url, text)).toBe(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:73\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:72.500,\n${url}\n#EXT-X-ENDLIST\n`)
})
it('retains ordinary HLS subtitle playlists without changing addresses', () => {
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n1.vtt\n#EXT-X-ENDLIST\n'
  expect(vttSubtitlePlaylist(url, playlist)).toBe(playlist)
})
it.each(['WEBVTT\n', 'WEBVTT\n\n00:00:00.000 --> 25:00:00.000\nToo long\n', 'WEBVTT\n\n00:00:00.000 --> 00:61:00.000\nInvalid\n'])('rejects unusable VTT durations', text => {
  expect(() => vttSubtitlePlaylist(url, text)).toThrow()
})
it('rejects unsafe segment addresses and oversized VTT', () => {
  const text = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption\n'
  expect(() => vttSubtitlePlaylist('http://127.0.0.1/internal', text)).toThrow()
  expect(() => vttSubtitlePlaylist(url + '\n#EXT-X-KEY:METHOD=AES-128', text)).toThrow()
  expect(() => vttSubtitlePlaylist(url, text + 'x'.repeat(1024 * 1024))).toThrow()
})
