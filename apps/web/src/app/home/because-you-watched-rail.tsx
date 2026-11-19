'use client'

import type { CatalogRef, CatalogTitleSummary } from '@consumit/contracts'
import { useEffect, useRef, useState } from 'react'
import { CircleMinus, RotateCcw, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@consumit/ui'
import { browserCatalogTitlesForRefs } from '@/lib/catalog-browser'
import { watchedSeeds, readWatchedSeeds, recommendationsForHistory, recommendationDismissals, changeRecommendationDismissal, recommendationKey } from '@/lib/recommendations'
import { useSession } from '../session/session'
import { TitleRail } from '../shared/title-rail'
import styles from './because-you-watched-rail.module.css'
export { readWatchedSeeds }

type FailedChoice = { ownerId: string; ref: CatalogRef | undefined; dismissed: boolean }

export function BecauseYouWatchedRail() {
  const { member, status } = useSession()
  const memberId = member?.id
  const currentOwner = useRef(memberId)
  useEffect(() => { currentOwner.current = memberId }, [memberId])
  const [owner, setOwner] = useState<string>()
  const loadedOwner = useRef<string | undefined>(undefined)
  const [seeds, setSeeds] = useState<CatalogTitleSummary[]>([])
  const [items, setItems] = useState<CatalogTitleSummary[]>([])
  const [hidden, setHidden] = useState<CatalogRef[]>([])
  const [undo, setUndo] = useState<CatalogRef>()
  const [error, setError] = useState<string | null>(null)
  const [failedChoice, setFailedChoice] = useState<FailedChoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [mutating, setMutating] = useState(false)
  const activeFailedChoice = failedChoice?.ownerId === memberId ? failedChoice : null
  useEffect(() => {
    if (!memberId || status !== 'authenticated') return
    const controller = new AbortController()
    void Promise.all([watchedSeeds(memberId, controller.signal), recommendationDismissals(controller.signal)]).then(async ([refs, dismissed]) => {
      const resolved = refs.length ? await browserCatalogTitlesForRefs(refs, controller.signal) : { titles: [], missing: [], unavailable: false }
      const titles = resolved.titles
      if (controller.signal.aborted) return
      if (loadedOwner.current !== memberId) {
        setItems([])
        setUndo(undefined)
        setFailedChoice(null)
        setLoading(false)
        setMutating(false)
      }
      loadedOwner.current = memberId
      const byKey = new Map(titles.map(title => [recommendationKey(title), title]))
      setSeeds(refs.flatMap(ref => { const title = byKey.get(recommendationKey(ref)); return title ? [title] : [] }))
      setHidden(dismissed); setOwner(memberId); setError(resolved.unavailable ? 'Some watched title details could not load.' : null)
    }).catch(() => {
      if (controller.signal.aborted) return
      if (loadedOwner.current !== memberId) {
        setSeeds([])
        setItems([])
        setHidden([])
        setUndo(undefined)
        setFailedChoice(null)
        setLoading(false)
        setMutating(false)
      }
      setOwner(memberId)
      setError('Your watched titles could not load.')
    })
    return () => controller.abort()
  }, [memberId, status, attempt])
  useEffect(() => {
    if (!seeds.length || owner !== memberId) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) { setLoading(true); setItems([]) } })
    void recommendationsForHistory(seeds, controller.signal).then(result => { if (!controller.signal.aborted) { setItems(result); setError(null) } }, () => { if (!controller.signal.aborted) setError('Recommendations could not load.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [seeds, memberId, owner, attempt])
  async function change(ref?: CatalogRef, dismissed = true, retrying = false) {
    const scope = memberId
    if (!scope) return
    if (!retrying) { setFailedChoice(null); setError(null) }
    setMutating(true)
    try {
      await changeRecommendationDismissal(ref, dismissed)
      if (scope !== currentOwner.current) return
      setHidden(current => !ref ? [] : dismissed ? [...current, ref] : current.filter(item => recommendationKey(item) !== recommendationKey(ref)))
      setUndo(dismissed ? ref : undefined); setError(null); setFailedChoice(null)
      if (!dismissed) setAttempt(value => value + 1)
    } catch { if (scope === currentOwner.current) { setFailedChoice({ ownerId: scope, ref, dismissed }); setError('Your recommendation choice could not sync. Try again.') } }
    finally { if (scope === currentOwner.current) setMutating(false) }
  }
  function retry() {
    if (activeFailedChoice) void change(activeFailedChoice.ref, activeFailedChoice.dismissed, true)
    else setAttempt(value => value + 1)
  }
  function retryLabel() {
    if (mutating) return 'Retrying…'
    if (!activeFailedChoice) return 'Retry'
    if (!activeFailedChoice.ref) return 'Retry reset'
    return activeFailedChoice.dismissed ? 'Retry Not interested' : 'Retry Undo'
  }
  if (!memberId || status !== 'authenticated' || owner !== memberId) return null
  if (!seeds.length && !error) return null
  const excluded = new Set([...hidden, ...readWatchedSeeds(memberId)].map(recommendationKey))
  const visible = [...new Map(items.filter(title => !excluded.has(recommendationKey(title))).map(title => [recommendationKey(title), title])).values()]
  return <section aria-label="Your recommendations" className={`${styles.recommendations} mt-10`}>
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div><h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl" id="filscreen-because-watched-heading">For your next watch</h2><p className="mt-1 text-xs text-muted">Picked from your recent watches.</p></div>
      <div className="flex flex-wrap items-center gap-x-3 text-xs">
        {undo ? <span aria-live="polite" className="text-muted">Hidden. <button className="min-h-8 text-orange underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={mutating} onClick={() => { void change(undo, false) }} type="button"><Undo2 aria-hidden="true" className="mr-1 inline size-3.5" />Undo</button></span> : null}
        {hidden.length ? <button className="min-h-8 text-copy underline underline-offset-4 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={mutating} onClick={() => { void change(undefined, false) }} type="button"><RotateCcw aria-hidden="true" className="mr-1 inline size-3.5" />Reset hidden</button> : null}
      </div>
    </div>
    {error ? <div className="mt-3 text-sm text-copy" role="alert">{error}<button className="ml-3 min-h-11 underline outline-none focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={mutating} onClick={retry} type="button">{retryLabel()}</button></div> : null}
    {loading ? <p className="py-5 text-sm text-copy" role="status">Finding titles to watch next…</p> : visible.length ? <TitleRail hideHeading id="filscreen-because-watched" title="For your next watch" items={visible.slice(0, 20)} renderAction={title => <button aria-label={`Not interested in ${title.title}`} className="grid size-11 place-items-center rounded-full bg-black/85 text-white/80 outline-none transition-colors hover:bg-black hover:text-white focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50 motion-reduce:transition-none" disabled={mutating} onClick={() => { void change({ kind: title.kind, id: title.id }) }} title="Not interested" type="button"><CircleMinus aria-hidden="true" className="size-5" /></button>} /> : !error ? <div className="py-5">
      <p className="text-sm text-copy">No titles fit your recent watches yet.</p>
      <nav aria-label="Browse more titles" className="mt-3 flex flex-wrap gap-2">
        <Link className={`${buttonVariants({ variant: 'secondary' })} min-h-[44px]`} href="/movies">Browse movies</Link>
        <Link className={`${buttonVariants({ variant: 'secondary' })} min-h-[44px]`} href="/series">Browse series</Link>
        <Link className={`${buttonVariants({ variant: 'secondary' })} min-h-[44px]`} href="/anime">Browse anime</Link>
      </nav>
    </div> : null}
  </section>
}
