import { describe, expect, it } from 'vitest'

import { audioTrackLabel, deviceAutoCapHeight, formatPlaybackTime, isSafeMediaUrl } from './media-source'

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

  it('names generic audio renditions without inventing languages', () => {
    // Real names and language tags pass through untouched.
    expect(audioTrackLabel({ name: 'English', lang: 'en' }, 0)).toBe('English')
    expect(audioTrackLabel({ name: '', lang: 'Deutsch' }, 1)).toBe('Deutsch')
    // Upstream Numbered placeholders ("Audio 1".."Audio N", no LANGUAGE):
    // the manifest default becomes Main audio, the rest keep numbers.
    expect(audioTrackLabel({ name: 'Audio 1', isDefault: true }, 0)).toBe('Main audio')
    expect(audioTrackLabel({ name: 'Audio 2' }, 1)).toBe('Audio 2')
    expect(audioTrackLabel({ name: 'AUDIO 10' }, 9)).toBe('AUDIO 10')
    expect(audioTrackLabel({}, 4)).toBe('Audio 5')
    expect(audioTrackLabel({ name: '  ' }, 2)).toBe('Audio 3')
  })
})
