'use client'

import type { LetterboxdImportDetail, LetterboxdImportItem } from '@consumit/contracts'
import { AlertTriangle, Check, FileArchive, RefreshCw, Trash2, Upload, Film, X } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useEffect, useId, useState } from 'react'

import { Button, Input, ProgressRail, buttonVariants } from '@consumit/ui'

import {
  confirmLetterboxdImport,
  deleteLetterboxdData,
  discardLetterboxdImport,
  getLetterboxdImport,
  getLetterboxdImports,
  retryLetterboxdImport,
  selectLetterboxdMatch,
  uploadLetterboxd,
} from '@/lib/letterboxd-browser'
import { IdentityApiError } from '@/lib/identity-browser'

function messageOf(error: unknown) {
  return error instanceof IdentityApiError ? error.message : 'The Letterboxd import could not continue.'
}

function ReviewItem({ detail, item, onChange }: { detail: LetterboxdImportDetail; item: LetterboxdImportItem; onChange: (detail: LetterboxdImportDetail) => void }) {
  const [tmdbId, setTmdbId] = useState(item.candidates[0]?.id ? String(item.candidates[0].id) : '')
  const [busy, setBusy] = useState(false)
  async function choose(selection: { skip?: boolean; tmdbId?: number }) {
    setBusy(true)
    try { onChange(await selectLetterboxdMatch(detail.import.id, item.id, selection)) } finally { setBusy(false) }
  }
  return (
    <article className="rounded-card border border-border bg-surface-raised p-5 transition-colors hover:border-control-outline">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{item.title ?? 'Untitled row'}</p>
          {item.year ? <p className="mt-0.5 text-xs text-muted">({item.year})</p> : null}
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-orange">{item.status.replace('_', ' ')}</p>
        </div>
        <Film aria-hidden="true" className="size-5 shrink-0 text-faint" />
      </div>
      {item.candidates.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.candidates.map((candidate) => (
            <Button
              disabled={busy}
              key={candidate.id}
              onClick={() => void choose({ tmdbId: candidate.id })}
              size="sm"
              variant="secondary"
            >
              {candidate.title}{candidate.year ? ` · ${candidate.year}` : ''}
            </Button>
          ))}
        </div>
      ) : null}
      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(event: FormEvent) => { event.preventDefault(); const id = Number(tmdbId); if (Number.isInteger(id) && id > 0) void choose({ tmdbId: id }) }}>
        <Input
          aria-label={`TMDB ID for ${item.title ?? 'row'}`}
          className="max-w-40"
          inputMode="numeric"
          onChange={(event) => setTmdbId(event.currentTarget.value)}
          placeholder="TMDB movie ID"
          value={tmdbId}
        />
        <Button disabled={busy || !tmdbId} size="sm" type="submit">Use ID</Button>
        <Button disabled={busy} onClick={() => void choose({ skip: true })} size="sm" type="button" variant="ghost">
          <X aria-hidden="true" className="size-3" /> Skip
        </Button>
      </form>
    </article>
  )
}

function ImportProgress({ detail }: { detail: LetterboxdImportDetail }) {
  const { progress, status } = detail.import
  const resolved = progress.exact + progress.confident + progress.skipped
  const percent = progress.total > 0 ? Math.round((resolved / progress.total) * 100) : 0
  const isProcessing = ['uploaded', 'processing'].includes(status)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs text-muted">
          {isProcessing ? 'Matching titles against TMDB…' : `${resolved} of ${progress.total} resolved`}
        </p>
        <p className="text-xs tabular-nums text-muted">{percent}%</p>
      </div>
      <ProgressRail
        className="h-1.5"
        label="Import progress"
        max={progress.total || 1}
        value={resolved}
      />
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        {progress.exact > 0 ? <span className="text-ink">{progress.exact} exact</span> : null}
        {progress.confident > 0 ? <span>{progress.confident} confident</span> : null}
        {progress.needsReview > 0 ? <span className="text-orange">{progress.needsReview} needs review</span> : null}
        {progress.unmatched > 0 ? <span className="text-orange">{progress.unmatched} unmatched</span> : null}
        {progress.skipped > 0 ? <span>{progress.skipped} skipped</span> : null}
      </div>
    </div>
  )
}

export function LetterboxdImportFlow({ completeHref = '/library' }: { completeHref?: string }) {
  const inputId = useId()
  const [detail, setDetail] = useState<LetterboxdImportDetail | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'uploading' | 'working'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getLetterboxdImports().then(async ({ imports }) => {
      const active = imports.find((item) => item.status !== 'confirmed') ?? imports[0]
      if (active && !cancelled) setDetail(await getLetterboxdImport(active.id))
    }).catch((caught) => { if (!cancelled) setError(messageOf(caught)) }).finally(() => { if (!cancelled) setState('idle') })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!detail || !['uploaded', 'processing'].includes(detail.import.status)) return
    const timer = window.setInterval(() => {
      void getLetterboxdImport(detail.import.id).then(setDetail).catch((caught) => setError(messageOf(caught)))
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [detail])

  async function upload(file: File | undefined) {
    if (!file) return
    setState('uploading'); setError(null)
    try {
      const batch = await uploadLetterboxd(file)
      setDetail(await getLetterboxdImport(batch.id))
    } catch (caught) { setError(messageOf(caught)) } finally { setState('idle') }
  }

  async function action(work: () => Promise<void>, refresh = true) {
    setState('working'); setError(null)
    try {
      await work()
      if (refresh && detail) setDetail(await getLetterboxdImport(detail.import.id))
    } catch (caught) { setError(messageOf(caught)) } finally { setState('idle') }
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-3 text-sm text-muted" role="status">
        <span className="size-4 animate-spin rounded-full border-2 border-faint border-t-transparent" />
        Loading your imports…
      </div>
    )
  }

  const reviewable = detail?.items.filter((item) => item.status === 'needs_review' || item.status === 'unmatched') ?? []

  return (
    <div className="space-y-6" data-consumit-letterboxd-import>
      {!detail || detail.import.status === 'confirmed' ? (
        <label
          className="group flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-control-outline bg-surface/50 p-7 text-center transition-colors hover:border-orange hover:bg-surface"
          htmlFor={inputId}
        >
          <Upload aria-hidden="true" className="size-8 text-faint transition-colors group-hover:text-orange" />
          <span className="mt-4 text-sm font-bold text-ink">Upload Letterboxd ZIP or CSV</span>
          <span className="mt-2 max-w-lg text-xs leading-5 text-muted">We stage and match your export, then show uncertain titles before anything changes in your profile.</span>
          <input
            accept=".zip,.csv,application/zip,text/csv"
            className="sr-only"
            disabled={state === 'uploading'}
            id={inputId}
            onChange={(event) => void upload(event.currentTarget.files?.[0])}
            type="file"
          />
        </label>
      ) : null}

      {detail ? (
        <section className="rounded-card border border-border bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-control bg-orange/10">
                <FileArchive aria-hidden="true" className="size-4 text-orange" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink">Letterboxd import</p>
                <p className="mt-0.5 text-xs uppercase tracking-[0.08em] text-muted">{detail.import.status.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <ImportProgress detail={detail} />
          </div>

          {['uploaded', 'processing'].includes(detail.import.status) ? (
            <div className="mt-6 flex items-center gap-3 rounded-control bg-surface-raised px-4 py-3">
              <span className="size-2 animate-pulse rounded-full bg-orange" />
              <p className="text-sm text-copy">Matching titles against TMDB. You can leave this page; progress is saved.</p>
            </div>
          ) : null}

          {detail.import.status === 'failed' ? (
            <div className="mt-6 rounded-control border border-danger/20 bg-danger/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
                <div>
                  <p className="text-sm text-ink">{detail.import.failedReason}</p>
                  <Button className="mt-4" disabled={state === 'working'} onClick={() => void action(() => retryLetterboxdImport(detail.import.id))} size="sm">
                    <RefreshCw aria-hidden="true" /> Retry matching
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {reviewable.length ? (
            <div className="mt-8">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl text-ink">Review uncertain titles</h3>
                <span className="text-xs text-muted">{reviewable.length} remaining</span>
              </div>
              <p className="mt-2 text-sm text-muted">These titles could not be matched automatically. Pick a candidate, enter a TMDB ID, or skip.</p>
              <div className="mt-5 space-y-3">
                {reviewable.map((item) => (
                  <ReviewItem detail={detail} item={item} key={item.id} onChange={setDetail} />
                ))}
              </div>
            </div>
          ) : null}

          {detail.import.status === 'ready' ? (
            <div className="mt-8 rounded-card border border-lime/20 bg-lime/5 p-6">
              <div className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-lime" />
                <div>
                  <p className="text-sm font-bold text-ink">Every row is resolved.</p>
                  <p className="mt-1 text-sm text-muted">Confirm to populate your real profile and library.</p>
                  <Button className="mt-5" disabled={state === 'working'} onClick={() => void action(() => confirmLetterboxdImport(detail.import.id))} variant="accent">
                    <Check aria-hidden="true" /> Confirm import
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {detail.import.status === 'confirmed' ? (
            <div className="mt-8 rounded-card border border-lime/20 bg-lime/5 p-6">
              <p className="text-sm font-bold text-lime">Import complete. Your real member data is ready.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link className={buttonVariants({ size: 'lg', variant: 'accent' })} href={completeHref}>View your library</Link>
                {confirmDelete ? (
                  <>
                    <Button disabled={state === 'working'} onClick={() => void action(async () => { await deleteLetterboxdData(); setDetail(null); setConfirmDelete(false) }, false)} variant="danger">
                      <Trash2 aria-hidden="true" /> Confirm removal
                    </Button>
                    <Button onClick={() => setConfirmDelete(false)} variant="ghost">Keep imported data</Button>
                  </>
                ) : (
                  <Button onClick={() => setConfirmDelete(true)} variant="ghost">
                    <Trash2 aria-hidden="true" /> Remove imported data
                  </Button>
                )}
              </div>
              {confirmDelete ? (
                <p className="mt-3 text-xs leading-5 text-muted">Only untouched Letterboxd-owned records are removed. Native records and imported records you edited remain.</p>
              ) : null}
            </div>
          ) : null}

          {detail.import.status !== 'confirmed' ? (
            <Button className="mt-7" disabled={state === 'working'} onClick={() => void action(async () => { await discardLetterboxdImport(detail.import.id); setDetail(null) }, false)} variant="ghost">
              <Trash2 aria-hidden="true" /> Discard staged import
            </Button>
          ) : null}
        </section>
      ) : null}

      {state === 'uploading' ? (
        <div className="flex items-center gap-3 text-sm text-muted" role="status">
          <span className="size-4 animate-spin rounded-full border-2 border-faint border-t-transparent" />
          Uploading and validating your export…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-control border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
