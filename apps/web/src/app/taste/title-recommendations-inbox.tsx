'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import Link from 'next/link'
import { tasteRecommendationPageSchema, titleHref, type TasteRecommendationResponse } from '@consumit/contracts'
import { Button, SectionHeading } from '@consumit/ui'
import { changeRecommendationDismissal } from '@/lib/recommendations'
import { browserCatalogTitlesForRefs } from '@/lib/catalog-browser'
import { setMemberSaved, setMemberWatched } from '@/lib/identity-browser'
import { TastePoster } from './primitives'
import { errorText, tasteRead, tasteWrite } from './api'

type Page = z.infer<typeof tasteRecommendationPageSchema>
type FailedAction =
  | { kind: 'load'; cursor?: string }
  | { kind: 'respond'; id: string; ref: Page['items'][number]['title']; response: TasteRecommendationResponse }
const responseText: Record<TasteRecommendationResponse, string> = {
  saved: 'Saved to your Watchlist.',
  'already-seen': 'Marked as watched.',
  'not-interested': 'Not interested. This title is hidden from your next-watch recommendations.',
}

export function TitleRecommendationsInbox() {
  const [page, setPage] = useState<Page | null>(null)
  const [titles, setTitles] = useState<Map<string, Awaited<ReturnType<typeof browserCatalogTitlesForRefs>>['titles'][number]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [failedAction, setFailedAction] = useState<FailedAction | null>(null)

  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    try {
      const result = await tasteRead(`recommendations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, tasteRecommendationPageSchema, signal)
      if (signal?.aborted) return
      setPage(current => cursor && current ? { ...result, items: [...current.items, ...result.items] } : result)
      setFailedAction(null)
      const catalog = await browserCatalogTitlesForRefs(result.items.map(item => item.title), signal)
      if (signal?.aborted) return
      setTitles(current => new Map([...current, ...catalog.titles.map(item => [`${item.kind}:${item.id}`, item] as const)]))
    } catch (cause) {
      if (!signal?.aborted) {
        setError(errorText(cause))
        setFailedAction(cursor === undefined ? { kind: 'load' } : { kind: 'load', cursor })
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  function reload(cursor?: string) {
    setLoading(true)
    setError('')
    setFailedAction(null)
    void load(cursor)
  }

  useEffect(() => {
    const controller = new AbortController()
    // The load changes state only after its awaited API and catalog reads settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(undefined, controller.signal)
    return () => controller.abort()
  }, [load])

  const items = page?.items ?? []
  const anyPending = items.some(item => item.response === null)
  const titleKey = useMemo(() => (kind: string, id: number) => `${kind}:${id}`, [])

  async function choose(recommendationId: string, ref: Page['items'][number]['title'], response: TasteRecommendationResponse) {
    if (busy) return
    setBusy(recommendationId)
    setError('')
    setFailedAction(null)
    try {
      if (response === 'saved') await setMemberSaved(ref, true)
      else if (response === 'already-seen') await setMemberWatched(ref, true)
      else await changeRecommendationDismissal(ref, true)
      await tasteWrite(`recommendations/${encodeURIComponent(recommendationId)}/response`, { response })
      setPage(current => current ? { ...current, items: current.items.map(item => item.id === recommendationId ? { ...item, response } : item) } : current)
    } catch (cause) {
      setError(errorText(cause))
      setFailedAction({ kind: 'respond', id: recommendationId, ref, response })
    } finally {
      setBusy(null)
    }
  }

  function retry() {
    if (failedAction?.kind === 'respond') {
      void choose(failedAction.id, failedAction.ref, failedAction.response)
      return
    }
    setLoading(true)
    setError('')
    void load(failedAction?.kind === 'load' ? failedAction.cursor : undefined)
  }

  const retryLabel = failedAction?.kind === 'respond'
    ? `Retry ${failedAction.response === 'saved' ? 'saving' : failedAction.response === 'already-seen' ? 'marking as seen' : 'dismissing'} ${titles.get(titleKey(failedAction.ref.kind, failedAction.ref.id))?.title ?? 'this title'}`
    : 'Retry loading recommendations'

  if (!loading && !items.length && !error) return null
  return <section className="taste mb-8" aria-labelledby="title-recommendations-heading">
    <SectionHeading id="title-recommendations-heading" title="Titles recommended to you" description="A title card from someone you follow. Your choice stays private." />
    {loading && !page ? <p className="py-4 text-sm text-muted" role="status">Loading title recommendations…</p> : null}
    {items.map(item => {
      const title = titles.get(titleKey(item.title.kind, item.title.id))
      return <article className="taste-notice" key={item.id}>
        <p className="mb-2 text-sm text-copy"><strong>{item.sender.name}</strong> thought you might like this · {item.createdAt.slice(0, 10)}</p>
        <div className="taste-recommendation-title">
          <TastePoster fallbackText={title?.title.slice(0, 1).toUpperCase() ?? item.title.kind.slice(0, 1).toUpperCase()} refValue={item.title} title={title} small />
          <Link className="taste-recommendation-title-link" href={titleHref(item.title)}>{title?.title ?? `${item.title.kind} #${item.title.id}`}</Link>
        </div>
        {item.response ? <p className="mt-3 text-sm text-copy" role="status">{responseText[item.response]}</p> : <div className="taste-actions mt-3" aria-label={`Choose what to do with ${title?.title ?? 'this title'}`}>
          <Button disabled={Boolean(busy)} onClick={() => void choose(item.id, item.title, 'saved')} size="sm" variant="primary">{busy === item.id ? 'Saving…' : 'Save'}</Button>
          <Button disabled={Boolean(busy)} onClick={() => void choose(item.id, item.title, 'already-seen')} size="sm" variant="secondary">Already seen</Button>
          <Button disabled={Boolean(busy)} onClick={() => void choose(item.id, item.title, 'not-interested')} size="sm" variant="ghost">Not interested</Button>
        </div>}
      </article>
    })}
    {anyPending ? <p className="sr-only" role="status">You have title recommendations to respond to.</p> : null}
    {page?.nextCursor ? <Button className="mt-3" disabled={loading} onClick={() => reload(page.nextCursor!)} variant="secondary">{loading ? 'Loading…' : 'More recommendations'}</Button> : null}
    {error ? <p className="taste-status" role="alert">{error} <Button disabled={Boolean(busy || loading)} onClick={retry} size="sm" variant="secondary">{retryLabel}</Button></p> : null}
  </section>
}
