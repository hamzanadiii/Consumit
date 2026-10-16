'use client'

import { kindLabel, titleHref, watchHref, type CatalogTitleSummary, type MemberProfileData, type WatchHistoryEntry, type WatchHistoryPage } from '@consumit/contracts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { DiaryRow, buttonVariants } from '@consumit/ui'

import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getMemberWatchHistoryPage } from '@/lib/identity-browser'

import { LogDialog } from '../catalog/log-dialog'
import { ProfileArchiveShell } from './profile-archive-shell'

function refKey(ref: Pick<WatchHistoryEntry, 'id' | 'kind'>) { return `${ref.kind}:${ref.id}` }

export function ProfileHistoryScreen({ data, history, historyUnavailable, titles: initialTitles }: {
  data: MemberProfileData
  history: WatchHistoryPage
  historyUnavailable: boolean
  titles: readonly CatalogTitleSummary[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(history.items)
  const [cursor, setCursor] = useState(history.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(historyUnavailable)
  const [titles, setTitles] = useState(initialTitles)
  const [catalogError, setCatalogError] = useState(false)
  const [diaryTarget, setDiaryTarget] = useState<WatchHistoryEntry | null>(null)
  const titleMap = useMemo(() => new Map(titles.map((title) => [refKey(title), title])), [titles])

  async function loadMore() {
    if (loading || (!cursor && !error)) return
    setLoading(true)
    setError(false)
    try {
      const page = await getMemberWatchHistoryPage(error && items.length === 0 ? undefined : cursor ?? undefined)
      setItems((current) => {
        const known = new Set(current.map((entry) => entry.entryId))
        return [...current, ...page.items.filter((entry) => !known.has(entry.entryId))]
      })
      setCursor(page.nextCursor)
      try {
        const loaded = await browserCatalogBatches(page.items)
        setTitles((current) => [...new Map([...current, ...loaded].map((title) => [refKey(title), title])).values()])
      } catch { setCatalogError(true) }
    } catch { setError(true) }
    finally { setLoading(false) }
  }

  return (
    <ProfileArchiveShell data={data} heading="Watch history" owner section="history">
        <section aria-labelledby="profile-archive-heading" className="py-5">
          <p className="text-sm text-[var(--fs-muted)]">Completed movies and episodes, kept private. Your Diary contains the watches you choose to log.</p>
          {catalogError ? <p className="mt-5 text-sm text-[var(--fs-muted)]" role="status">Some poster details could not load. Your history is still here.</p> : null}
          {items.length === 0 && !error ? <p className="mt-8 border-y border-[var(--fs-line)] py-8 text-sm text-[var(--fs-muted)]">Finish a movie or episode in Watch and it will appear here.</p> : null}
          {items.length > 0 ? <div className="mt-7 max-w-5xl">{items.map((entry) => {
            const title = titleMap.get(refKey(entry))
            const label = title?.title ?? `${kindLabel(entry.kind)} #${entry.id}`
            const episodeLabel = entry.kind === 'series' ? `S${entry.season} E${entry.episode}` : entry.kind === 'anime' ? `Episode ${entry.episode}` : 'Movie'
            return <DiaryRow action={<span className="flex flex-wrap items-center gap-x-4 gap-y-2"><Link className="text-sm font-bold text-[var(--fs-accent)] underline underline-offset-4" href={watchHref(entry, { season: entry.season ?? 1, episode: entry.episode ?? 1 })}>Watch again</Link><button aria-label={`Log ${label}, ${episodeLabel}, to diary`} className="text-sm font-bold text-[var(--fs-accent)] underline underline-offset-4" onClick={() => setDiaryTarget(entry)} type="button">Log to diary</button></span>} artworkSrc={title?.posterUrl ?? undefined} date={new Date(entry.completedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} detail={`${episodeLabel} · Completed`} href={titleHref(entry)} key={entry.entryId} title={label} />
          })}</div> : null}
          {error ? <p className="mt-5 text-sm text-[var(--fs-danger)]" role="alert">Watch history could not load. Try again.</p> : null}
          {cursor || error ? <button className={`${buttonVariants({ variant: 'secondary' })} mt-6`} disabled={loading} onClick={() => void loadMore()} type="button">{loading ? 'Loading history…' : error ? 'Try again' : 'Load more history'}</button> : null}
        </section>
      {diaryTarget ? (() => {
        const title = titleMap.get(refKey(diaryTarget))
        return <LogDialog episode={diaryTarget.episode} id={diaryTarget.id} key={diaryTarget.entryId} kind={diaryTarget.kind} onClose={() => setDiaryTarget(null)} onSaved={() => { setDiaryTarget(null); router.refresh() }} posterUrl={title?.posterUrl ?? undefined} season={diaryTarget.season} title={title?.title ?? `${kindLabel(diaryTarget.kind)} #${diaryTarget.id}`} watchedOn={new Date(diaryTarget.completedAt).toISOString().slice(0, 10)} year={title?.year} />
      })() : null}
    </ProfileArchiveShell>
  )
}
