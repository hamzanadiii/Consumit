import { describe, expect, it } from 'vitest'

import { MAX_OFFSET_MS, shiftVtt } from './sync.ts'

const VTT = 'WEBVTT\n\n00:00.000 --> 00:04.000 align:start position:0%\nHi\n\n01:02:03.500 --> 01:02:05.000\nYo\n'

describe('shiftVtt', () => {
  it('shifts two- and three-part timestamps and preserves settings', () => {
    const shifted = shiftVtt(VTT, 3000)
    expect(shifted).toContain('00:03.000 --> 00:07.000 align:start position:0%')
    expect(shifted).toContain('01:02:06.500 --> 01:02:08.000')
    expect(shifted).toContain('WEBVTT')
  })

  it('shifts backwards and clamps advanced cues to zero', () => {
    const shifted = shiftVtt(VTT, -2000)!
    expect(shifted).toContain('00:00.000 --> 00:02.000')
    expect(shifted).toContain('01:02:01.500 --> 01:02:03.000')
  })

  it('rejects zero, non-integer, and out-of-range offsets', () => {
    expect(shiftVtt(VTT, 0)).toBeNull()
    expect(shiftVtt(VTT, 1.5)).toBeNull()
    expect(shiftVtt(VTT, MAX_OFFSET_MS + 1)).toBeNull()
    expect(shiftVtt(VTT, -(MAX_OFFSET_MS + 1))).toBeNull()
    expect(shiftVtt('WEBVTT\n\nno cues\n', 1000)).toBeNull()
  })
})
