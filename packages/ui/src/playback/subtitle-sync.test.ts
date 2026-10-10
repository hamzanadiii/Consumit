import { describe, expect, it, vi } from 'vitest'

import {
  cleanSubtitleLanguages,
  canonicalSubtitleLanguage,
  clampSubtitleDelayMs,
  computeSyncDelayMs,
  cueTextAt,
  findCuesAt,
  formatSubtitleDelayMs,
  nativeLanguageName,
  subtitleLabelDetail,
  parseVttCues,
} from './subtitle-sync'

const SAMPLE = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello <i>world</i>

2
00:00:05,500 --> 00:00:07,000
Second line {an8}

NOTE a comment

00:01:00.000 --> 00:01:02.000
Overlapping <b>bold</b>
00:01:01.000 --> 00:01:03.000
Second overlap
`

describe('parseVttCues', () => {
  it('parses cues, strips tags, and skips NOTE blocks', () => {
    const cues = parseVttCues(SAMPLE)
    expect(cues).toHaveLength(4)
    expect(cues[0]).toMatchObject({ startTime: 1, endTime: 4, text: 'Hello world' })
    expect(cues[1]).toMatchObject({ startTime: 5.5, endTime: 7 })
    expect(cues.every((cue) => !cue.text.includes('NOTE'))).toBe(true)
  })

  it('rejects garbage without throwing', () => {
    expect(parseVttCues('not subtitles at all')).toEqual([])
    expect(parseVttCues('')).toEqual([])
  })
})

describe('findCuesAt', () => {
  const cues = parseVttCues(SAMPLE)

  it('finds the containing cue and joins overlaps', () => {
    expect(findCuesAt(cues, 2).map((cue) => cue.text)).toEqual(['Hello world'])
    expect(findCuesAt(cues, 61).map((cue) => cue.text)).toEqual(['Overlapping bold', 'Second overlap'])
  })

  it('returns nothing outside cue ranges', () => {
    expect(findCuesAt(cues, 0)).toEqual([])
    expect(findCuesAt(cues, 4.5)).toEqual([])
    expect(findCuesAt([], 2)).toEqual([])
  })
})

describe('cueTextAt', () => {
  const cues = parseVttCues(SAMPLE)

  it('shifts lookup by the sync delay', () => {
    // +2000ms shows the 1s cue already at t=0.
    expect(cueTextAt(cues, 0, 2000)).toBe('Hello world')
    // -2000ms hides the 1s cue at t=2.
    expect(cueTextAt(cues, 2, -2000)).toBe('')
    expect(cueTextAt(cues, 2, 0)).toBe('Hello world')
  })
})

describe('computeSyncDelayMs', () => {
  it('solves the offset so the clicked cue starts at the click time', () => {
    // Paused: exact difference.
    expect(computeSyncDelayMs(61, 60, false)).toBe(1000)
    // Playing: 350ms reaction compensation.
    expect(computeSyncDelayMs(61, 60, true)).toBe(1350)
  })
})

describe('nativeLanguageName', () => {
  it('keeps release details while excluding bare multilingual provider labels', () => {
    for (const label of ['Arabic', 'Albanian', 'اَلْعَرَبِيَّةُ', 'Українська', 'தமிழ்', 'Türkçe']) {
      expect(subtitleLabelDetail(label)).toBeUndefined()
    }
    expect(subtitleLabelDetail('A New Hope')).toBe('A New Hope')
    expect(subtitleLabelDetail('Movie.1080p.BluRay')).toBe('Movie.1080p.BluRay')
  })
  it('renders native names PROVE-embed style', () => {
    expect(nativeLanguageName('ar', 'Arabic (yify)')).toBe('العربية')
    expect(nativeLanguageName('en', 'English (yify)')).toBe('English')
    expect(nativeLanguageName('es', 'Spanish')).toBe('Español')
    expect(nativeLanguageName('fr', 'French')).toBe('Français')
    expect(nativeLanguageName('pt', 'Portuguese')).toBe('Português')
  })

  it('falls back to the label without a usable code', () => {
    expect(nativeLanguageName(undefined, 'English (yify)')).toBe('English (yify)')
    expect(nativeLanguageName('', 'Off')).toBe('Off')
    expect(nativeLanguageName('und', 'Uploaded')).toBe('Uploaded')
  })

  it('retains ISO alias grouping and label fallback without language display support', () => {
    const display = vi.spyOn(Intl, 'DisplayNames').mockImplementation(() => { throw new Error('Unavailable ICU') })
    try {
      expect(canonicalSubtitleLanguage('eng')).toBe('en')
      expect(canonicalSubtitleLanguage('en_US')).toBe('en-us')
      expect(nativeLanguageName('eng', 'English')).toBe('English')
    } finally { display.mockRestore() }
  })
})

describe('cleanSubtitleLanguages', () => {
  it('keeps up to three ordered codes and drops garbage', () => {
    expect(cleanSubtitleLanguages(['ar', 'FR', 'es', 'de'])).toEqual(['ar', 'fr', 'es'])
    expect(cleanSubtitleLanguages(['en', 'en', 'toolong', 42, ''])).toEqual(['en'])
    expect(cleanSubtitleLanguages(null)).toEqual([])
    expect(cleanSubtitleLanguages('en')).toEqual([])
  })
})

describe('delay bounds and formatting', () => {
  it('clamps to ±30s and formats like the old HUD', () => {
    expect(clampSubtitleDelayMs(Number.NaN)).toBe(0)
    expect(clampSubtitleDelayMs(99_999)).toBe(30_000)
    expect(clampSubtitleDelayMs(-99_999)).toBe(-30_000)
    expect(formatSubtitleDelayMs(0)).toBe('0ms')
    expect(formatSubtitleDelayMs(500)).toBe('+500ms')
    expect(formatSubtitleDelayMs(-100)).toBe('-100ms')
  })
})
