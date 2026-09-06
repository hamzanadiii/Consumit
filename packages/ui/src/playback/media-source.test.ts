import { describe, expect, it } from 'vitest'

import { formatPlaybackTime, isSafeMediaUrl } from './media-source'

describe('media-source seam', () => {
  it('accepts authorized https delivery URLs', () => {
    expect(isSafeMediaUrl('https://cdn.consumit.example/movie/1080p.m3u8')).toBe(true)
  })

  it('rejects hostile playback URLs', () => {
    expect(isSafeMediaUrl('http://cdn.consumit.example/movie.mp4')).toBe(false)
    expect(isSafeMediaUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeMediaUrl('data:video/mp4;base64,AAAA')).toBe(false)
    expect(isSafeMediaUrl('https://localhost/movie.mp4')).toBe(false)
    expect(isSafeMediaUrl('https://127.0.0.1/movie.mp4')).toBe(false)
    expect(isSafeMediaUrl('https://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isSafeMediaUrl('https://cdn.consumit.example/movie.mp4?x=<script>')).toBe(false)
    expect(isSafeMediaUrl('  https://cdn.consumit.example/movie.mp4')).toBe(false)
    expect(isSafeMediaUrl('')).toBe(false)
  })

  it('formats prototype timecodes', () => {
    expect(formatPlaybackTime(2538)).toBe('42:18')
    expect(formatPlaybackTime(7680)).toBe('2:08:00')
    expect(formatPlaybackTime(61)).toBe('1:01')
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00')
    expect(formatPlaybackTime(-4)).toBe('0:00')
  })
})
