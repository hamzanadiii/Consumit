'use client'

import { Select } from '@consumit/next-ui'
import { RatingFilter } from './rating-filter'
import { ArrowDownUp, RotateCcw } from 'lucide-react'

export type TitleCollectionSort = 'recent' | 'release-newest' | 'release-oldest' | 'title'

export function titleDecade(year: number | null | undefined) {
  return year && Number.isFinite(year) && year > 0 ? String(Math.floor(year / 10) * 10) : undefined
}

export function TitleCollectionFilters({
  decades = [], genres, hasActiveFilters, onDecadeChange, onGenreChange, onRatingChange, onReset, onSortChange,
  recentLabel = 'Recently added', rating = 'any', unavailableRatings, selectedDecade = 'all', selectedGenre,
  showRating = false, sort,
}: {
  decades?: readonly string[]
  genres: readonly string[]
  hasActiveFilters?: boolean
  onDecadeChange?: (decade: string) => void
  onGenreChange: (genre: string) => void
  onRatingChange?: (rating: string) => void
  onReset?: () => void
  onSortChange: (sort: TitleCollectionSort) => void
  recentLabel?: string
  rating?: string
  unavailableRatings?: 'all' | 'none'
  selectedDecade?: string
  selectedGenre: string
  showRating?: boolean
  sort: TitleCollectionSort
}) {
  const sorts = [
    { value: 'recent', label: recentLabel },
    { value: 'release-newest', label: 'Newest releases' },
    { value: 'release-oldest', label: 'Oldest releases' },
    { value: 'title', label: 'Title A–Z' },
  ]
  const activeClass = '[&>button]:text-[var(--fs-accent)]'
  const active = hasActiveFilters ?? (selectedGenre !== 'all' || selectedDecade !== 'all' || rating !== 'any' || sort !== 'recent')
  return <div aria-label="Filter titles" className="flex flex-wrap items-center gap-x-1 gap-y-1" role="group">
    {onDecadeChange ? <Select className={selectedDecade === 'all' ? undefined : activeClass} disabled={decades.length === 0 && selectedDecade === 'all'} hideLabel label="Filter by decade" onValueChange={onDecadeChange} options={[{ value: 'all', label: 'All decades' }, ...decades.map((decade) => ({ value: decade, label: `${decade}s` }))]} triggerLabel={selectedDecade === 'all' ? 'Decade' : `${selectedDecade}s`} value={selectedDecade} variant="toolbar" /> : null}
    <Select className={selectedGenre === 'all' ? undefined : activeClass} disabled={genres.length === 0 && selectedGenre === 'all'} hideLabel label="Filter by genre" onValueChange={onGenreChange} options={[{ value: 'all', label: 'All genres' }, ...genres.map((genre) => ({ value: genre, label: genre }))]} triggerLabel={selectedGenre === 'all' ? 'Genre' : selectedGenre} value={selectedGenre} variant="toolbar" />
    {showRating && onRatingChange ? <RatingFilter onChange={onRatingChange} unavailable={unavailableRatings} value={rating} /> : null}
    <Select hideLabel label="Sort titles" onValueChange={(value) => onSortChange(value as TitleCollectionSort)} options={sorts} triggerLabel={<span className="flex items-center gap-2"><ArrowDownUp aria-hidden="true" className="size-3.5 shrink-0" />{sorts.find((option) => option.value === sort)?.label}</span>} value={sort} variant="toolbar" />
    {active && onReset ? <button className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 text-xs text-[var(--fs-muted)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={onReset} type="button"><RotateCcw aria-hidden="true" className="size-3" />Reset</button> : null}
  </div>
}
