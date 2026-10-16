'use client'

import type { CatalogKind, CatalogRef, CatalogTitleSummary } from '@consumit/contracts'
import { useEffect, useRef, useState } from 'react'
import { CircleMinus, RotateCcw, Undo2 } from 'lucide-react'
import { browserCatalogBatch } from '@/lib/catalog-browser'
import { watchedSeeds, readWatchedSeeds, recommendedTitles, recommendationDismissals, changeRecommendationDismissal, recommendationKey } from '@/lib/recommendations'
import { useSession } from '../session/session'
import { TitleRail } from '../shared/title-rail'
import styles from './because-you-watched-rail.module.css'
export { readWatchedSeeds }

export function BecauseYouWatchedRail() {
  const { member, status } = useSession()
  const memberId = member?.id
  const currentOwner = useRef(memberId)
  useEffect(() => { currentOwner.current = memberId }, [memberId])
  const [owner, setOwner] = useState<string>()
  const [seeds, setSeeds] = useState<CatalogTitleSummary[]>([])
  const [selected, setSelected] = useState('')
  const [items, setItems] = useState<CatalogTitleSummary[]>([])
  const [hidden, setHidden] = useState<CatalogRef[]>([])
  const [undo, setUndo] = useState<CatalogRef>()
  const [kind, setKind] = useState<CatalogKind | 'all'>('all')
  const [sort, setSort] = useState('recommended')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [mutating, setMutating] = useState(false)
  useEffect(() => {
    if (!memberId || status !== 'authenticated') return
    const controller = new AbortController()
    void Promise.all([watchedSeeds(memberId, controller.signal), recommendationDismissals(controller.signal)]).then(async ([refs, dismissed]) => {
      const titles = refs.length ? (await browserCatalogBatch(refs, controller.signal)).items : []
      if (controller.signal.aborted) return
      setSeeds(refs.flatMap(ref => titles.filter(title => recommendationKey(title) === recommendationKey(ref))))
      setSelected(refs[0] ? recommendationKey(refs[0]) : ''); setHidden(dismissed); setOwner(memberId); setError(null)
    }).catch(() => { if (!controller.signal.aborted) { setOwner(memberId); setError('Your watched titles could not load.') } })
    return () => controller.abort()
  }, [memberId, status, attempt])
  const seed = seeds.find(title => recommendationKey(title) === selected && (kind === 'all' || title.kind === kind)) ?? seeds.find(title => kind === 'all' || title.kind === kind)
  useEffect(() => {
    if (!seed || owner !== memberId) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setItems([]) } })
    void recommendedTitles(seed, controller.signal).then(result => { if (!controller.signal.aborted) { setItems(result); setError(null) } }, () => { if (!controller.signal.aborted) setError('Recommendations could not load.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [seed, memberId, owner, attempt])
  async function change(ref?: CatalogRef, dismissed = true) {
    const scope = memberId
    setMutating(true)
    try {
      await changeRecommendationDismissal(ref, dismissed)
      if (scope !== currentOwner.current) return
      setHidden(current => !ref ? [] : dismissed ? [...current, ref] : current.filter(item => recommendationKey(item) !== recommendationKey(ref)))
      setUndo(dismissed ? ref : undefined); setError(null)
      if (!dismissed) setAttempt(value => value + 1)
    } catch { if (scope === currentOwner.current) setError('Your recommendation choice could not sync. Try again.') }
    finally { if (scope === currentOwner.current) setMutating(false) }
  }
  if (!memberId || status !== 'authenticated' || owner !== memberId) return null
  if (!seeds.length && !error) return null
  const excluded = new Set([...hidden, ...readWatchedSeeds(memberId)].map(recommendationKey))
  const visible = [...new Map(items.filter(title => !excluded.has(recommendationKey(title)) && (kind === 'all' || title.kind === kind)).map(title => [recommendationKey(title), title])).values()]
  if (sort === 'rating') visible.sort((a, b) => (b.tmdbRating ?? -1) - (a.tmdbRating ?? -1))
  if (sort === 'newest') visible.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
  const selectClass = 'h-11 min-w-0 max-w-full rounded-control border border-white/10 bg-surface px-3 text-xs text-ink outline-none transition-colors hover:border-white/25 focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none'
  return <section aria-label="Your recommendations" className={`${styles.recommendations} mt-10`}>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl" id="filscreen-because-watched-heading">For your next watch</h2><p className="mt-1.5 text-xs text-muted">A little more of what you love, from your watch history.</p></div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {undo ? <span aria-live="polite" className="text-muted">Recommendation hidden.</span> : null}
        {undo ? <button className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-orange outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={mutating} onClick={() => { void change(undo, false) }} type="button"><Undo2 aria-hidden="true" className="size-3.5" />Undo Not interested</button> : null}
        {hidden.length ? <button className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-copy outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={mutating} onClick={() => { void change(undefined, false) }} type="button"><RotateCcw aria-hidden="true" className="size-3.5" />Reset Not interested</button> : null}
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-y border-white/10 py-3">
      {seed ? <label className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted"><span>Because you watched</span><select aria-label="Choose a watched title for recommendations" className={`${selectClass} w-full sm:w-auto sm:max-w-80`} onChange={event => setSelected(event.target.value)} value={recommendationKey(seed)}>{seeds.filter(title => kind === 'all' || title.kind === kind).map(title => <option key={recommendationKey(title)} value={recommendationKey(title)}>{title.title}</option>)}</select></label> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select aria-label="Recommendation title type" className={selectClass} onChange={event => setKind(event.target.value as CatalogKind | 'all')} value={kind}><option value="all">All types</option><option value="movie">Movies</option><option value="series">Series</option><option value="anime">Anime</option></select>
      <select aria-label="Sort recommendations" className={selectClass} onChange={event => setSort(event.target.value)} value={sort}><option value="recommended">Recommended</option><option value="rating">Top rated</option><option value="newest">Newest</option></select>
      </div>
    </div>
    {error ? <div className="mt-3 text-sm text-copy" role="alert">{error}<button className="ml-3 min-h-11 underline" onClick={() => setAttempt(value => value + 1)} type="button">Retry</button></div> : null}
    {loading ? <p className="py-5 text-sm text-copy" role="status">Finding titles to watch next…</p> : visible.length ? <TitleRail hideHeading id="filscreen-because-watched" title="For your next watch" items={visible.slice(0, 20)} renderAction={title => <button aria-label={`Not interested in ${title.title}`} className="grid size-11 place-items-center rounded-full bg-black/85 text-white/80 outline-none transition-colors hover:bg-black hover:text-white focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50 motion-reduce:transition-none" disabled={mutating} onClick={() => { void change({ kind: title.kind, id: title.id }) }} title="Not interested" type="button"><CircleMinus aria-hidden="true" className="size-5" /></button>} /> : !error ? <p className="py-5 text-sm text-copy">No recommendations for this selection yet. Choose another watched title or reset Not interested.</p> : null}
  </section>
}
