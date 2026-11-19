/** Format date-only values without shifting their calendar day across timezones. */
export function formatCalendarDay(value: string, withYear = false): string {
  const day = value.slice(0, 10)
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}
