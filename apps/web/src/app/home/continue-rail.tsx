'use client'

import { titleHref, type CatalogTitleSummary } from '@consumit/contracts'
import { Check, Info, Pencil, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { ArtworkFrame } from '@consumit/ui'

import { browserCatalogBatch } from '@/lib/catalog-browser'
import { catalogKey } from '@/lib/catalog-registry'
import { loadResumeEntries, hideResumeEntry, type ResumeEntry } from '@/lib/continue-watching'
import { useSession } from '../session/session'

import { SaveTitleButton } from '../catalog/save-title-button'
import styles from './continue-rail.module.css'

function remainingLabel(positionSeconds: number, durationSeconds: number | null | undefined): string | null {
  if (!durationSeconds) return null
  const remainingSeconds = durationSeconds - positionSeconds
  if (remainingSeconds <= 0) return null
  const minutes = Math.max(1, Math.round(remainingSeconds / 60))
  if (minutes < 60) return `${minutes}m left`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`
}

export function ContinueRail() {
  const {member,status:sessionStatus}=useSession()
  const memberId=member?.id
  const [editError,setEditError]=useState<string|null>(null)
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading')
  const [rows, setRows] = useState<readonly { entry: ResumeEntry; title: CatalogTitleSummary }[]>([])
  const [rowsOwner, setRowsOwner] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setEditing(false)
    setStatus('loading')
    const controller = new AbortController()
    void loadResumeEntries(memberId, controller.signal).then(async entries => {
      if(cancelled) return
      if(!entries.length) {setRows([]);setStatus('empty');return}
      const batch=await browserCatalogBatch(entries.map(entry=>({kind:entry.kind,id:entry.id})),controller.signal)
      if(cancelled) return
      const byKey=new Map(batch.items.map(item=>[catalogKey(item),item]))
      const resolved=entries.flatMap(entry=>{const title=byKey.get(catalogKey(entry));return title?[{entry,title}]:[]})
      setRows(resolved);setRowsOwner(memberId);setStatus(resolved.length?'ready':'empty')
    }).catch(()=>{if(!cancelled){setRows([]);setStatus('error')}})
    return () => {
      cancelled = true;controller.abort()
    }
  }, [memberId])

  async function removeEntry(storageKey:string) {
    const row=rows.find(row=>row.entry.storageKey===storageKey)
    if(!row)return
    setEditError(null)
    try {await hideResumeEntry(row.entry,memberId);setRows(current=>current.filter(item=>item.entry.storageKey!==storageKey))}
    catch(error){setEditError(error instanceof Error?error.message:'This title could not be hidden.')}
  }

  // State follows the awaited batch response; the empty path resolves the
  // mount default synchronously so no network work starts without progress.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {if(sessionStatus==='loading'){setRows([]);return}return load()}, [load,sessionStatus])

  if (sessionStatus === 'loading' || sessionStatus === 'unavailable' || rowsOwner !== memberId || status !== 'ready' || rows.length === 0) return null

  const showEditToggle = status === 'ready' && rows.length > 0

  return (
    <section aria-labelledby="filscreen-continue-title" className="mt-8">
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

        {editError?<p className="text-sm text-[var(--fs-secondary)]" role="alert">{editError}</p>:null}
        <ul aria-label="Your in-progress titles" className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain rounded-xl py-1 pr-1 pb-5 fs-noscroll outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" role="region" tabIndex={0}>
          {rows.map(({ entry, title }) => {
        const href=entry.href
        const episodeLabel=entry.kind==='anime'?`E${entry.episode??1} · `:entry.kind==='series'?`S${entry.season??1} E${entry.episode??1} · `:''
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
    </section>
  )
}
