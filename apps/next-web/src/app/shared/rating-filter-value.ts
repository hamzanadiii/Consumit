export type RatingRangeValue = `${number}-${number}`
export function parseRatingRange(value: string): [number, number] | null {
  const match = /^([1-9]|10)-([1-9]|10)$/.exec(value)
  if (!match) return null
  const low = Number(match[1]), high = Number(match[2])
  return low <= high ? [low, high] : null
}
export function matchesRatingFilter(value: string, score: number | undefined) {
  if (value === 'any') return true
  if (value === 'none') return score === undefined
  const range = parseRatingRange(value)
  return score !== undefined && (range ? score >= range[0] && score <= range[1] : score === Number(value))
}
