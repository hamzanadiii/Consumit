import { describe, expect, it, vi } from 'vitest'

import {
  cleanSubtitleLanguages,
  decodeSubtitleBytes,
  canonicalSubtitleLanguage,
  clampSubtitleDelayMs,
  computeSyncDelayMs,
  cueTextAt,
  findCuesAt,
  formatSubtitleDelayMs,
  nativeLanguageName,
  subtitleLabelDetail,
  parseAssCues,
  parseSubtitleCues,
  parseVttCues,
  serializeSubtitleCues,
  fetchVttCues,
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

describe('parseSubtitleCues', () => {
  const SRT = '1\r\n00:00:01,000 --> 00:00:04,000\r\nSRT caption\r\n'
  const ASS = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\b1}ASS caption{\\b0}
`

  it('routes WebVTT and SRT through the VTT block parser', () => {
    expect(parseSubtitleCues(SAMPLE)[0]).toMatchObject({ startTime: 1, text: 'Hello world' })
    expect(parseSubtitleCues(SRT)).toHaveLength(1)
    expect(parseSubtitleCues(SRT)[0]).toMatchObject({ startTime: 1, endTime: 4, text: 'SRT caption' })
  })

  it('sniffs ASS content and strips override tags', () => {
    const cues = parseSubtitleCues(ASS)
    expect(cues).toHaveLength(1)
    expect(cues[0]).toMatchObject({ startTime: 1, endTime: 4, text: 'ASS caption' })
  })

  it('returns empty for garbage without throwing', () => {
    expect(parseSubtitleCues('not subtitles at all')).toEqual([])
    expect(parseSubtitleCues('')).toEqual([])
  })

  it('serializes SRT and ASS cues as parseable WebVTT for native text tracks', () => {
    const srt = '1\n00:00:00,000 --> 00:00:04,000\nUploaded <literal> & safe\n'
    const ass = `[Script Info]\nTitle: Test\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:08.00,0:00:12.00,Default,,0,0,0,,Later cue\n`
    for (const input of [srt, ass]) {
      const cues = parseSubtitleCues(input)
      const vtt = serializeSubtitleCues(cues)
      expect(vtt).toMatch(/^WEBVTT\n/)
      expect(parseSubtitleCues(vtt)).toEqual(cues)
    }
    expect(serializeSubtitleCues([{ startTime: 1, endTime: 2, text: 'A < B & C' }])).toContain('A &lt; B &amp; C')
  })
})

describe('decodeSubtitleBytes', () => {
  it('decodes undeclared Windows-1256 Arabic before cue parsing', () => {
    const header = new TextEncoder().encode('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n')
    const word = new Uint8Array([0xe3, 0xd1, 0xcd, 0xc8, 0xc7])
    const bytes = new Uint8Array(header.length + word.length * 3 + 4)
    bytes.set(header)
    let offset = header.length
    for (let i = 0; i < 3; i++) {
      bytes.set(word, offset)
      offset += word.length
      bytes[offset++] = 0x20
    }
    bytes[offset] = 0x0a
    const decoded = decodeSubtitleBytes(bytes)
    expect(decoded).toContain('مرحبا مرحبا مرحبا')
    expect(parseSubtitleCues(decoded)[0]?.text).toBe('مرحبا مرحبا مرحبا')
  })
})

describe('parseAssCues', () => {
  it('drops drawing spans and keeps readable text', () => {
    const ass = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 45 0{\\p0}Readable text
`
    const cues = parseAssCues(ass)
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('Readable text')
    expect(cues[0]!.text).not.toContain('m 0 0')
  })

  it('parses Events with no Format line using the standard field order', () => {
    const ass = `[Script Info]
Title: Test

[Events]
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,No format line
`
    const cues = parseAssCues(ass)
    expect(cues).toHaveLength(1)
    expect(cues[0]).toMatchObject({ startTime: 1, endTime: 4, text: 'No format line' })
  })

  it('ignores Comment lines and sections outside Events', () => {
    const ass = `[Script Info]
Title: Test

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Comment: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Not a caption
Dialogue: 0,0:00:02.00,0:00:05.00,Default,,0,0,0,,Real caption
`
    const cues = parseAssCues(ass)
    expect(cues).toHaveLength(1)
    expect(cues[0]!.text).toBe('Real caption')
  })

  it('rejects malformed timestamps without throwing', () => {
    const cues = parseAssCues('[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,bogus,0:00:04.00,Default,,0,0,0,,Bad time\n')
    expect(cues).toEqual([])
  })
})

describe('fetchVttCues', () => {
  it('strips a server-side offsetMs param so the client stays the single source of delay', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello\n', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const cues = await fetchVttCues('https://subs.example/en.vtt?offsetMs=1500&token=abc', new AbortController().signal)
      expect(cues).toHaveLength(1)
      const requested = fetchMock.mock.calls[0]![0]
      expect(requested).not.toContain('offsetMs')
      expect(requested).toContain('token=abc')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('parses ASS session tracks served over https', async () => {
    const ass = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Streamed ASS cue
`
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ass, { status: 200 })))
    try {
      const cues = await fetchVttCues('https://subs.example/en.ass', new AbortController().signal)
      expect(cues).toHaveLength(1)
      expect(cues[0]).toMatchObject({ startTime: 1, endTime: 4, text: 'Streamed ASS cue' })
    } finally {
      vi.unstubAllGlobals()
    }
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
