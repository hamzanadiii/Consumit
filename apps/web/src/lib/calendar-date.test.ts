import { describe, expect, it } from 'vitest'

import { formatCalendarDay } from './calendar-date'

describe('formatCalendarDay', () => {
  it('preserves the recorded calendar day and optional year', () => {
    expect(formatCalendarDay('2026-10-28', true)).toBe('Oct 28, 2026')
    expect(formatCalendarDay('2026-10-28')).toBe('Oct 28')
  })
})
