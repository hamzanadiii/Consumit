'use client'

import { progressWriteRequestSchema, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { useEffect, useState } from 'react'
import { browserCatalogBatch, browserCatalogTitle } from '@/lib/catalog-browser'
import { TitleRail } from '../shared/title-rail'

/** Only completed watches earn this heading; never infer history from a shelf. */
export function readWatchedSeeds(): CatalogRef[] {
  const recent = new Map<string, { ref: CatalogRef; updatedAt: number; order: number }>()
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith('consumit.progress:')) continue
      try {
        const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')
        const parsed = progressWriteRequestSchema.safeParse(raw)
        if (!parsed.success) continue
        const { kind, id, completed, durationSeconds, positionSeconds } = parsed.data
        if (kind !== 'movie' && kind !== 'series') continue
        if (!completed && !(durationSeconds && positionSeconds / durationSeconds >= 0.95)) continue
        const stamp = (raw as { updatedAt?: unknown }).updatedAt
        const time = typeof stamp === 'string' ? Date.parse(stamp) : NaN
        const entry = { ref: { kind, id }, updatedAt: Number.isFinite(time) ? time : 0, order: index }
        const existing = recent.get(`${kind}:${id}`)
        if (!existing || entry.updatedAt >= existing.updatedAt) recent.set(`${kind}:${id}`, entry)
      } catch { /* Ignore corrupt individual records. */ }
    }
  } catch { return [] }
  return [...recent.values()].sort((a, b) => b.updatedAt - a.updatedAt || b.order - a.order).slice(0, 5).map(({ ref }) => ref)
}

export function BecauseYouWatchedRail() {
  const [seeds, setSeeds] = useState<CatalogTitleSummary[]>([])
  const [selected, setSelected] = useState('')
  const [items, setItems] = useState<CatalogTitleSummary[]>([])
  const [status, setStatus] = useState<'hidden' | 'loading' | 'ready' | 'empty' | 'error'>('hidden')
  const [attempt, setAttempt] = useState(0)
  const [seedAttempt, setSeedAttempt] = useState(0)
  const [seedError, setSeedError] = useState(false)

  useEffect(() => {
    const refs = readWatchedSeeds()
    if (!refs.length) return
    const controller = new AbortController()
    void browserCatalogBatch(refs, controller.signal).then(({ items: titles }) => {
      if (controller.signal.aborted) return
      const ordered = refs.flatMap((ref) => titles.filter((title) => title.kind === ref.kind && title.id === ref.id))
      setSeeds(ordered)
      setSelected(ordered[0] ? `${ordered[0].kind}:${ordered[0].id}` : '')
      setSeedError(false)
    }, () => { if (!controller.signal.aborted) setSeedError(true) })
    return () => controller.abort()
  }, [seedAttempt])

  useEffect(() => {
    const seed = seeds.find((title) => `${title.kind}:${title.id}` === selected)
    if (!seed) return
    const controller = new AbortController()
    void browserCatalogTitle({ kind: seed.kind, id: seed.id }, controller.signal).then((detail) => {
      if (controller.signal.aborted) return
      const watched = new Set(seeds.map((title) => `${title.kind}:${title.id}`))
      const unique = new Map(detail.recommendations.filter((title) => !watched.has(`${title.kind}:${title.id}`)).map((title) => [`${title.kind}:${title.id}`, title]))
      setItems([...unique.values()].slice(0, 10))
      setStatus(unique.size ? 'ready' : 'empty')
    }, () => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [seeds, selected, attempt])

  if (seedError) return <section aria-label="Because you watched" className="mt-8 text-sm text-[var(--fs-secondary)]"><p>Your watched titles could not load.</p><button className="mt-2 min-h-10 underline underline-offset-4 focus-visible:outline-2" onClick={() => setSeedAttempt((value) => value + 1)} type="button">Try again</button></section>
  const seed = seeds.find((title) => `${title.kind}:${title.id}` === selected)
  if (!seed) return null
  const heading = <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span>Because you watched</span><select aria-label="Choose a watched title for recommendations" className="min-h-11 max-w-full cursor-pointer truncate rounded-control border-0 bg-[var(--fs-shell)] pr-2 text-[var(--fs-ink)] underline decoration-[var(--fs-muted)] underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onChange={(event) => { setSelected(event.target.value); setItems([]); setStatus('loading') }} value={selected}>{seeds.map((title) => <option key={`${title.kind}:${title.id}`} value={`${title.kind}:${title.id}`}>{title.title}</option>)}</select></span>
  if (status === 'ready') return <TitleRail heading={heading} id="filscreen-because-watched" items={items} title={`Because you watched ${seed.title}`} />
  return <section aria-labelledby="because-watched-heading" className="mt-8"><h2 className="font-display text-2xl" id="because-watched-heading">{heading}</h2><div className="mt-4 text-sm text-[var(--fs-secondary)]">{status === 'error' ? <><p role="alert">Recommendations could not load.</p><button className="mt-2 min-h-10 underline underline-offset-4 focus-visible:outline-2" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1) }} type="button">Try again</button></> : status === 'empty' ? <p>No recommendations for this title yet. Choose another watched title.</p> : <p role="status">Finding titles to watch next…</p>}</div></section>
}
