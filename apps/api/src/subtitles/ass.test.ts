import { describe, expect, it } from 'vitest'
import { assToVtt } from './ass.ts'

const SAMPLE_ASS = `[Script Info]
Title: Test
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello World
Dialogue: 0,0:00:05.50,0:00:08.25,Default,,0,0,0,,Second line here
Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,{\\b1}Bold text{\\b0} normal
Dialogue: 0,0:00:15.00,0:00:17.00,Default,,0,0,0,,Line with\\Nline break
Dialogue: 0,0:00:20.00,0:00:22.00,Default,,0,0,0,,{\\fnMonospace\\fs24}Font tag
`

describe('assToVtt', () => {
  it('converts basic ASS dialogue to VTT', () => {
    const vtt = assToVtt(SAMPLE_ASS)
    expect(vtt).not.toBeNull()
    expect(vtt).toContain('WEBVTT')
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000')
    expect(vtt).toContain('Hello World')
  })

  it('handles multiple dialogue lines', () => {
    const vtt = assToVtt(SAMPLE_ASS)!
    expect(vtt).toContain('Second line here')
    expect(vtt).toContain('00:00:05.500 --> 00:00:08.250')
  })

  it('strips override formatting tags', () => {
    const vtt = assToVtt(SAMPLE_ASS)!
    expect(vtt).toContain('Bold text')
    expect(vtt).not.toContain('{\\b1}')
    expect(vtt).not.toContain('{\\b0}')
  })

  it('converts ASS line breaks', () => {
    const vtt = assToVtt(SAMPLE_ASS)!
    expect(vtt).toContain('Line with\nline break')
    expect(vtt).not.toContain('\\N')
  })

  it('strips font and size tags', () => {
    const vtt = assToVtt(SAMPLE_ASS)!
    expect(vtt).toContain('Font tag')
    expect(vtt).not.toContain('{\\fnMonospace')
    expect(vtt).not.toContain('{\\fs24}')
  })

  it('returns null for empty input', () => {
    expect(assToVtt('')).toBeNull()
    expect(assToVtt('[Script Info]\nTitle: Test\n')).toBeNull()
  })

  it('returns null when no valid dialogue lines', () => {
    const noDialogue = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
    expect(assToVtt(noDialogue)).toBeNull()
  })

  it('handles SSA v4 format (not just ASS v4+)', () => {
    const ssa = `[Script Info]
Title: SSA Test
ScriptType: v4.00

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, ...
Style: Default,Arial,20,16777215,65535,65535,-2147483640,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:30.00,0:01:35.00,Default,,0,0,0,,SSA format works
`
    const vtt = assToVtt(ssa)
    expect(vtt).toContain('WEBVTT')
    expect(vtt).toContain('00:01:30.000 --> 00:01:35.000')
    expect(vtt).toContain('SSA format works')
  })

  it('skips dialogue with zero or negative duration', () => {
    const bad = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:05.00,Default,,0,0,0,,Same start and end
Dialogue: 0,0:00:10.00,0:00:05.00,Default,,0,0,0,,End before start
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Valid line
`
    const vtt = assToVtt(bad)!
    expect(vtt).toContain('Valid line')
    expect(vtt).not.toContain('Same start and end')
    expect(vtt).not.toContain('End before start')
  })

  it('handles BOM at start', () => {
    const withBom = '\uFEFF' + SAMPLE_ASS
    const vtt = assToVtt(withBom)
    expect(vtt).toContain('Hello World')
  })

  it('handles \\n line breaks', () => {
    const input = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Line one\\nLine two
`
    const vtt = assToVtt(input)!
    expect(vtt).toContain('Line one\nLine two')
  })
})
