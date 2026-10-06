'use client'

import { titleHref, watchHref, progressWriteRequestSchema, type CatalogTitleSummary } from '@consumit/contracts'
import { Check, Info, Pencil, RotateCcw, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { ArtworkFrame } from '@consumit/ui'

import { browserCatalogBatch } from '@/lib/catalog-browser'
import { catalogKey } from '@/lib/catalog-registry'

import { SaveTitleButton } from '../catalog/save-title-button'
import styles from './continue-rail.module.css'

type ResumeEntry = {
  durationSeconds: number | null | undefined
  episode?: number | undefined
  kind: 'movie' | 'series' | 'anime'
  id: number
  percent: number
  positionSeconds: number
  season?: number | undefined
  storageKey: string
  updatedAt: number
}

// Titles watched to (or past) this share of their runtime count as finished:
// they drop out of Continue watching instead of lingering at 95%+.
const FINISHED_RATIO = 0.95

// One catalog batch holds at most 24 titles; 20 keeps every visible card in a
// single request while leaving headroom for titles that fail to resolve.
const MAX_CONTINUE_TITLES = 20

function readResumeEntries(): ResumeEntry[] {
  const entries = new Map<string, { entry: ResumeEntry; order: number }>()
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    return []
  }
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key || !key.startsWith('consumit.progress:')) continue
    let payload: unknown = null
    try {
      payload = JSON.parse(storage.getItem(key) ?? 'null')
    } catch {
      continue
    }
    const parsed = progressWriteRequestSchema.safeParse(payload)
    if (!parsed.success || parsed.data.completed) continue
    const { episode, id, kind, positionSeconds, season } = parsed.data
    if (kind !== 'movie' && kind !== 'series') continue
    if (positionSeconds < 60) continue
    const mapKey = `${kind}:${id}:${season ?? 0}:${episode ?? 0}`
    const durationSeconds = parsed.data.durationSeconds
    if (durationSeconds && positionSeconds / durationSeconds >= FINISHED_RATIO) continue
    const percent = durationSeconds
      ? Math.min(99, Math.max(1, Math.round((positionSeconds / durationSeconds) * 100)))
      : 0
    // Last-watched-first: prefer an explicit updatedAt timestamp, falling back
    // to insertion order for legacy records written without one.
    const rawUpdatedAt = (payload as { updatedAt?: unknown } | null)?.updatedAt
    const updatedAt = typeof rawUpdatedAt === 'string' ? Date.parse(rawUpdatedAt) : NaN
    if (entries.has(mapKey)) continue
    entries.set(mapKey, {
      entry: {
        durationSeconds,
        episode,
        id,
        kind,
        percent,
        positionSeconds,
        season,
        storageKey: key,
        updatedAt: Number.isFinite(updatedAt) ? (updatedAt as number) : 0,
      },
      order: index,
    })
  }
  return [...entries.values()]
    .sort((a, b) => b.entry.updatedAt - a.entry.updatedAt || b.order - a.order)
    .map((item) => item.entry)
    .slice(0, MAX_CONTINUE_TITLES)
}

function remainingLabel(positionSeconds: number, durationSeconds: number | null | undefined): string | null {
  if (!durationSeconds) return null
  const remainingSeconds = durationSeconds - positionSeconds
  if (remainingSeconds <= 0) return null
  const minutes = Math.max(1, Math.round(remainingSeconds / 60))
  if (minutes < 60) return `${minutes}m left`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`
}

export function ContinueRail() {
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading')
  const [rows, setRows] = useState<readonly { entry: ResumeEntry; title: CatalogTitleSummary }[]>([])
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setEditing(false)
    setStatus('loading')
    const entries = readResumeEntries()
    if (entries.length === 0) {
      setRows([])
      setStatus('empty')
      return
    }
    // No AbortController here on purpose: aborting the shared catalog fetch
    // surfaces a reasonless AbortError rejection outside this chain in some
    // browsers. Late responses are ignored through `cancelled` instead while
    // the request layer keeps its own timeout for hung calls.
    void browserCatalogBatch(
      entries.map((entry) => ({ id: entry.id, kind: entry.kind })),
    ).then(
      (batch) => {
        if (cancelled) return
        const byKey = new Map(batch.items.map((item) => [catalogKey(item), item]))
        const resolved = entries.flatMap((entry) => {
          const title = byKey.get(`${entry.kind}:${entry.id}`)
          return title ? [{ entry, title }] : []
        })
        setRows(resolved)
        setStatus(resolved.length === 0 ? 'empty' : 'ready')
      },
      () => {
        if (cancelled) return
        setRows([])
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Removal is device-local, like the rail itself: dropping the stored
  // progress record hides the title here. Watching it again re-adds it.
  function removeEntry(storageKey: string) {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // Storage denial leaves the row visible; the next load restores it.
    }
    const next = rows.filter(({ entry }) => entry.storageKey !== storageKey)
    setRows(next)
    if (next.length === 0) {
      setEditing(false)
      setStatus('empty')
    }
  }

  // State follows the awaited batch response; the empty path resolves the
  // mount default synchronously so no network work starts without progress.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => load(), [load])

  const showEditToggle = status === 'ready' && rows.length > 0

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl tracking-[-0.02em]" id="filscreen-continue-title">Continue watching</h2>
        {showEditToggle ? (
          <button
            aria-label={editing ? 'Done editing Continue watching' : 'Edit Continue watching'}
            aria-pressed={editing}
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-[var(--fs-muted)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            onClick={() => setEditing((value) => !value)}
            type="button"
          >
            {editing ? (
              <Check aria-hidden="true" className="size-[18px] text-[var(--fs-accent)]" />
            ) : (
              <Pencil aria-hidden="true" className="size-[18px]" />
            )}
          </button>
        ) : null}
      </div>

      {status === 'loading' ? (
        <div className="mt-4 flex snap-x gap-4 overflow-x-auto overscroll-x-contain py-1 pr-1 pb-3 fs-noscroll" role="status" aria-label="Loading your in-progress titles">
          {[0, 1, 2].map((index) => (
            <div aria-hidden="true" className="aspect-video w-[85%] max-w-[26rem] shrink-0 animate-pulse rounded-xl bg-[var(--fs-accent-soft)] sm:w-[22rem] lg:w-[25rem]" key={index} />
          ))}
        </div>
      ) : status === 'error' ? (
        <div className="mt-3 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]">Your in-progress titles could not load, but nothing was lost.</p>
          <button
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            onClick={() => load()}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Try again
          </button>
        </div>
      ) : status === 'empty' ? (
        <div className="mt-3 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]">Nothing in progress yet. Watch a title and pick up right here.</p>
          <Link className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/movies">
            Explore movies
          </Link>
        </div>
      ) : (
        <ul aria-label="Your in-progress titles" className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain rounded-xl py-1 pr-1 pb-5 fs-noscroll outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" role="region" tabIndex={0}>
          {rows.map(({ entry, title }) => {
        const href = watchHref(title, entry.season !== undefined || entry.episode !== undefined
          ? { episode: entry.episode ?? 1, season: entry.season ?? 1 }
          : undefined)
        const episodeLabel = entry.kind === 'series' && (entry.season !== undefined || entry.episode !== undefined)
          ? `S${entry.season ?? 1} E${entry.episode ?? 1} · `
          : ''
        const remaining = remainingLabel(entry.positionSeconds, entry.durationSeconds)
        const positionMinutes = Math.floor(entry.positionSeconds / 60)
        const totalMinutes = entry.durationSeconds ? Math.max(1, Math.round(entry.durationSeconds / 60)) : null
        const metaText = `${episodeLabel}${remaining ?? (entry.percent > 0 ? `${entry.percent}% watched` : title.year)}`
        const coverKey = `${entry.kind}:${entry.id}:${entry.season ?? 0}:${entry.episode ?? 0}`
        return (
          <li
            className="w-[85%] max-w-[26rem] shrink-0 snap-start py-2 sm:w-[22rem] lg:w-[25rem]"
            data-cover-item
            data-cover-key={coverKey}
            key={coverKey}
          >
            <div className={`group relative ${styles.card}`}>
              <div className={`relative overflow-hidden rounded-xl border border-[var(--fs-line)] bg-[var(--fs-field)] ${styles.surface}`}>
                {/* Full-card link for direct resume playback. z-[1] keeps it
                    above the artwork frame (a later positioned sibling that
                    would otherwise swallow every click) and below the
                    action buttons (z-10) and edit-mode remove (z-20). */}
                <Link
                  aria-label={`Continue ${title.title}`}
                  className="absolute inset-0 z-[1] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                  href={href}
                />

                <ArtworkFrame
                  alt={`${title.title} backdrop`}
                  className={`rounded-none border-0 ${styles.artwork}`}
                  loading="lazy"
                  ratio="landscape"
                  src={title.backdropUrl ?? title.posterUrl ?? undefined}
                >
                  {/* Cinematic gradient overlays */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"
                  />
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent ${styles.topScrim}`}
                  />

                  {/* Bottom: Editorial title, time info, and progress rail */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 pt-6">
                    <p className="truncate font-display text-lg font-normal leading-tight text-white sm:text-xl">
                      {title.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs tabular-nums text-white/70">
                      {metaText ? <span className="truncate text-white/75">{metaText}</span> : <span />}
                      <span className="shrink-0 font-medium text-white/80">
                        {totalMinutes === null ? `${positionMinutes}m` : `${positionMinutes}m of ${totalMinutes}m`}
                      </span>
                    </div>
                    <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className="relative h-full rounded-full bg-[var(--fs-accent)]"
                        style={{ width: `${entry.percent}%` }}
                      >
                      </div>
                    </div>
                  </div>
                </ArtworkFrame>

                {/* Keep action buttons above the full-card resume link. */}
                {editing ? (
                  <button
                    aria-label={`Remove ${title.title} from Continue watching`}
                    className="absolute top-3 right-3 z-20 grid size-9 cursor-pointer place-items-center rounded-control border border-white/20 bg-black/60 text-white shadow-sm backdrop-blur-md outline-none transition-all duration-150 hover:scale-105 hover:border-white/40 hover:bg-white/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                    onClick={(e) => { e.stopPropagation(); removeEntry(entry.storageKey); }}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : (
                <div className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 ${styles.actions}`}>
                  <SaveTitleButton
                    className="!size-9 !h-9 !w-9 !p-0 [&_svg]:!size-4 rounded-control border border-white/20 bg-black/60 text-white shadow-sm backdrop-blur-md transition-all duration-150 hover:scale-105 hover:border-white/40 hover:bg-white/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                    id={title.id}
                    kind={title.kind}
                    title={title.title}
                  />
                  <Link
                    aria-label={`Open ${title.title} details`}
                    className="grid size-9 shrink-0 place-items-center rounded-control border border-white/20 bg-black/60 text-white shadow-sm backdrop-blur-md outline-none transition-all duration-150 hover:scale-105 hover:border-white/40 hover:bg-white/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                    href={titleHref(title)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info aria-hidden="true" className="size-4" />
                  </Link>
                </div>
                )}
              </div>
            </div>
          </li>
        )
      })}
        </ul>
      )}
    </>
  )
}
