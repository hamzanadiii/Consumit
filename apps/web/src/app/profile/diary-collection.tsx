'use client'

import { diaryEntryHref, kindLabel, type CatalogTitleSummary, type DiaryEntry } from '@consumit/contracts'
import { ArtworkFrame, RatingDisplay, Select } from '@consumit/ui'
import { ArrowDownUp, BookOpen, RotateCcw, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { titleDecade } from '../shared/title-collection-filters'
import { DiaryEntryActions } from './diary-entry-actions'
import { RatingFilter, matchesRatingFilter } from '../shared/rating-filter'

type DiaryChanges = Pick<DiaryEntry, 'rewatch' | 'tags' | 'watchedOn'>
function refKey(ref: Pick<DiaryEntry, 'id' | 'kind'>) { return `${ref.kind}:${ref.id}` }
function episodeLabel(entry: DiaryEntry) {
  if (entry.episode === undefined) return ''
  return entry.kind === 'series' ? `S${String(entry.season).padStart(2, '0')} E${String(entry.episode).padStart(2, '0')}` : `Episode ${entry.episode}`
}
function calendarDate(value: string) { return new Date(`${value}T00:00:00Z`) }
const activeClass = '[&>button]:text-[var(--fs-accent)]'
const ownerColumns = 'lg:grid-cols-[3rem_3.5rem_minmax(0,1fr)_4rem_8rem_4rem_5.5rem]'
const publicColumns = 'lg:grid-cols-[3rem_3.5rem_minmax(0,1fr)_4rem_4rem]'

export function DiaryCollection({ entries, hasMore, onDeleted, onSaved, owner, ratingsByTitle, ratingsUnavailable, selectedTag, titles }: {
  entries: readonly DiaryEntry[]
  hasMore: boolean
  onDeleted: (entryId: string) => void
  onSaved: (entryId: string, changes: DiaryChanges) => void
  owner: boolean
  ratingsByTitle: Readonly<Record<string, number>>
  ratingsUnavailable: boolean
  selectedTag?: string | undefined
  titles: readonly CatalogTitleSummary[]
}) {
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [decade, setDecade] = useState('all')
  const [genre, setGenre] = useState('all')
  const [rating, setRating] = useState('any')
  const [watches, setWatches] = useState('all')
  const [sort, setSort] = useState('newest')
  const titleMap = useMemo(() => new Map(titles.map(title => [refKey(title), title])), [titles])
  const years = [...new Set(entries.map(entry => entry.watchedOn.slice(0, 4)))].sort().reverse()
  const decades = [...new Set(titles.flatMap(title => { const value = titleDecade(title.year); return value ? [value] : [] }))].sort((a, b) => Number(b) - Number(a))
  const genres = [...new Set(titles.flatMap(title => title.genreNames))].sort((a, b) => a.localeCompare(b))
  const filtered = query.trim() !== '' || year !== 'all' || decade !== 'all' || genre !== 'all' || rating !== 'any' || watches !== 'all'
  function reset() { setQuery(''); setYear('all'); setDecade('all'); setGenre('all'); setRating('any'); setWatches('all'); setSort('newest') }
  const visible = entries.filter(entry => {
    const title = titleMap.get(refKey(entry))
    const label = title?.title ?? `${kindLabel(entry.kind)} #${entry.id}`
    if (selectedTag && !entry.tags.some(tag => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase())) return false
    if (query.trim() && !label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false
    if (year !== 'all' && entry.watchedOn.slice(0, 4) !== year) return false
    if (decade !== 'all' && titleDecade(title?.year) !== decade) return false
    if (genre !== 'all' && !title?.genreNames.includes(genre)) return false
    if (watches !== 'all' && entry.rewatch !== (watches === 'rewatches')) return false
    if (owner && rating !== 'any') {
      if (ratingsUnavailable) return false
      const score = ratingsByTitle[refKey(entry)]
      if (!matchesRatingFilter(rating, score)) return false
    }
    return true
  }).sort((a, b) => {
    if (sort === 'title') {
      const compare = (titleMap.get(refKey(a))?.title ?? `${kindLabel(a.kind)} #${a.id}`).localeCompare(titleMap.get(refKey(b))?.title ?? `${kindLabel(b.kind)} #${b.id}`)
      if (compare) return compare
    }
    return sort === 'oldest' ? a.watchedOn.localeCompare(b.watchedOn) : b.watchedOn.localeCompare(a.watchedOn)
  })
  const groups = new Map<string, DiaryEntry[]>()
  for (const entry of visible) {
    const month = entry.watchedOn.slice(0, 7)
    groups.set(month, [...(groups.get(month) ?? []), entry])
  }
  // Month chronology remains stable when titles are alphabetized within each month.
  const months = [...groups].sort(([a], [b]) => sort === 'oldest' ? a.localeCompare(b) : b.localeCompare(a))
  const columns = owner ? ownerColumns : publicColumns
  const sorts = [{ value: 'newest', label: 'Newest watches' }, { value: 'oldest', label: 'Oldest watches' }, { value: 'title', label: 'Title A–Z per month' }]

  return <div data-consumit-diary-collection>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-[var(--fs-line)] py-2" data-consumit-collection-toolbar>
      <label className="flex h-10 items-center gap-2 border-b border-transparent text-[var(--fs-muted)] focus-within:border-[var(--fs-focus)]"><Search aria-hidden="true" className="size-3.5" /><input aria-label="Search Diary" className="w-40 bg-transparent text-sm text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)]" onChange={event => setQuery(event.target.value)} placeholder={owner ? 'Search your diary' : 'Search diary'} type="search" value={query} /></label>
      <div aria-label="Filter Diary" className="flex flex-wrap items-center gap-1" role="group">
        <Select className={year === 'all' ? undefined : activeClass} hideLabel label="Filter by watched year" onValueChange={setYear} options={[{ value: 'all', label: 'All watched years' }, ...years.map(value => ({ value, label: value }))]} triggerLabel={year === 'all' ? 'Watched year' : year} value={year} variant="toolbar" />
        <Select className={decade === 'all' ? undefined : activeClass} hideLabel label="Filter Diary by release decade" onValueChange={setDecade} options={[{ value: 'all', label: 'All release decades' }, ...decades.map(value => ({ value, label: `${value}s` }))]} triggerLabel={decade === 'all' ? 'Decade' : `${decade}s`} value={decade} variant="toolbar" />
        <Select className={genre === 'all' ? undefined : activeClass} hideLabel label="Filter Diary by genre" onValueChange={setGenre} options={[{ value: 'all', label: 'All genres' }, ...genres.map(value => ({ value, label: value }))]} triggerLabel={genre === 'all' ? 'Genre' : genre} value={genre} variant="toolbar" />
        {owner ? <RatingFilter label="Filter Diary by your current rating" onChange={setRating} unavailable={ratingsUnavailable ? 'all' : undefined} value={rating} /> : null}
        <Select className={watches === 'all' ? undefined : activeClass} hideLabel label="Filter Diary by watch type" onValueChange={setWatches} options={[{ value: 'all', label: 'All watches' }, { value: 'rewatches', label: 'Rewatches' }, { value: 'first', label: 'First watches' }]} value={watches} variant="toolbar" />
        <Select hideLabel label="Sort Diary" onValueChange={setSort} options={sorts} triggerLabel={<span className="flex items-center gap-2"><ArrowDownUp aria-hidden="true" className="size-3.5" />{sorts.find(option => option.value === sort)?.label}</span>} value={sort} variant="toolbar" />
        {filtered || sort !== 'newest' ? <button className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 text-xs text-[var(--fs-muted)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onClick={reset} type="button"><RotateCcw aria-hidden="true" className="size-3" />Reset</button> : null}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs leading-5 text-[var(--fs-muted)]">
      <p role="status">{visible.length} {visible.length === 1 ? 'entry' : 'entries'}{filtered || selectedTag ? ` shown from ${entries.length} loaded` : ' loaded'}{hasMore ? ' · Load more to include earlier entries.' : ''}</p>
      {owner ? <p role={ratingsUnavailable ? 'status' : undefined}>{ratingsUnavailable ? 'Your ratings could not load; rating filters are unavailable.' : 'Ratings show your current title scores.'}</p> : null}
      {selectedTag ? <Link className="text-[var(--fs-accent)] underline underline-offset-4" href="?">Clear tag: {selectedTag}</Link> : null}
    </div>
    {visible.length ? <>
      <div aria-hidden="true" className="mt-6 hidden grid-cols-[7rem_minmax(0,1fr)] gap-6 border-b border-[var(--fs-line)] pb-3 text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--fs-muted)] lg:grid"><span>Month</span><div className={`grid items-center gap-4 ${columns}`}><span>Day</span><span className="col-span-2">Title</span><span>Released</span>{owner ? <span>Your rating</span> : null}<span>Rewatch</span>{owner ? <span className="text-right">Edit</span> : null}</div></div>
      {months.map(([month, rows]) => {
        const date = calendarDate(`${month}-01`)
        const fullMonth = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        return <section aria-label={fullMonth} className="grid gap-x-6 border-b border-[var(--fs-line)] lg:grid-cols-[7rem_minmax(0,1fr)]" key={month}>
          <h2 className="flex items-baseline gap-3 pt-5 lg:block lg:pt-7"><span className="sr-only">{fullMonth}</span><span aria-hidden="true" className="font-display text-3xl leading-none text-[var(--fs-ink)]">{date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span><span aria-hidden="true" className="text-sm tabular-nums text-[var(--fs-muted)] lg:mt-2 lg:block">{month.slice(0, 4)}</span></h2>
          <ol className="min-w-0 divide-y divide-[var(--fs-line)]">
            {rows.map(entry => {
              const title = titleMap.get(refKey(entry))
              const label = title?.title ?? `${kindLabel(entry.kind)} #${entry.id}`
              const score = ratingsByTitle[refKey(entry)]
              const href = diaryEntryHref(entry)
              return <li key={entry.entryId}><article className={`grid min-w-0 grid-cols-[3rem_3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 lg:min-h-28 ${columns}`} data-consumit-diary-row>
                <time aria-label={calendarDate(entry.watchedOn).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })} className="font-display text-3xl tabular-nums text-[var(--fs-muted)]" dateTime={entry.watchedOn}>{entry.watchedOn.slice(-2)}</time>
                <Link aria-label={`Open ${label}`} className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={href}><ArtworkFrame alt="" src={title?.posterUrl ?? undefined} /></Link>
                <div className="min-w-0"><Link className="font-display text-xl leading-tight text-[var(--fs-ink)] outline-none hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] lg:text-2xl" href={href}>{label}</Link><p className="mt-1 text-xs text-[var(--fs-muted)]">{[kindLabel(entry.kind), episodeLabel(entry)].filter(Boolean).join(' · ')}</p>{entry.tags.length ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--fs-muted)]">{entry.tags.map(tag => `#${tag}`).join(' ')}</p> : null}</div>
                <p className="col-start-3 text-xs tabular-nums text-[var(--fs-muted)] lg:col-start-auto lg:text-sm"><span className="lg:sr-only">Released </span>{title?.year ?? 'Unknown'}</p>
                {owner ? <div className="col-start-3 flex items-center gap-2 lg:col-start-auto">{ratingsUnavailable ? <span className="text-xs text-[var(--fs-muted)]">Unavailable</span> : score !== undefined ? <><RatingDisplay aria-label={`Your current title rating: ${score} out of 10`} className="[&>span]:text-sm" value={score / 2} /><span className="text-xs tabular-nums text-[var(--fs-secondary)]">{score}/10</span></> : <span className="text-xs text-[var(--fs-muted)]">Not rated</span>}</div> : null}
                <span aria-label={entry.rewatch ? 'Rewatch' : 'First watch'} className={`col-start-3 flex items-center gap-1.5 text-xs lg:col-start-auto lg:justify-center ${entry.rewatch ? 'text-[var(--fs-accent)]' : 'text-[var(--fs-muted)]'}`}>{entry.rewatch ? <RotateCcw aria-hidden="true" className="size-4" /> : <span aria-hidden="true">—</span>}<span className="lg:sr-only">{entry.rewatch ? 'Rewatch' : 'First watch'}</span></span>
                {owner ? <DiaryEntryActions compact entryId={entry.entryId} onDeleted={() => onDeleted(entry.entryId)} onSaved={changes => onSaved(entry.entryId, changes)} rewatch={entry.rewatch} tags={entry.tags} title={label} watchedOn={entry.watchedOn} /> : null}
              </article></li>
            })}
          </ol>
        </section>
      })}
    </> : <div className="mt-7 border-y border-dashed border-[var(--fs-line)] py-12 text-center"><BookOpen aria-hidden="true" className="mx-auto size-6 text-[var(--fs-muted)]" /><h2 className="mt-4 font-display text-2xl text-[var(--fs-ink)]">{entries.length ? 'No diary entries match.' : owner ? 'Your diary starts with a watch.' : 'No watches logged yet.'}</h2><p className="mt-2 text-sm text-[var(--fs-muted)]">{entries.length ? 'Try another year, genre, or search.' : owner ? 'Log a watch from a title page to keep its date, episode, and rewatch here.' : 'This member’s public diary entries will appear here.'}</p>{filtered ? <button className="mt-4 min-h-10 text-sm text-[var(--fs-accent)] underline underline-offset-4" onClick={reset} type="button">Clear filters</button> : null}</div>}
  </div>
}
