import { describe, expect, it } from 'vitest'

import { deviceAutoCapHeight, formatPlaybackTime, isSafeMediaUrl } from './media-source'

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

  it('caps Auto quality by viewport tier', () => {
    expect(deviceAutoCapHeight({ width: 390, height: 844 })).toBe(720)
    expect(deviceAutoCapHeight({ width: 844, height: 390 })).toBe(720)
    expect(deviceAutoCapHeight({ width: 1280, height: 700 })).toBe(1080)
    expect(deviceAutoCapHeight({ width: 1920, height: 1080 })).toBe(Number.POSITIVE_INFINITY)
    expect(deviceAutoCapHeight({ width: 0, height: 0 })).toBe(Number.POSITIVE_INFINITY)
    expect(deviceAutoCapHeight({ width: Number.NaN, height: 800 })).toBe(Number.POSITIVE_INFINITY)
  })
})
