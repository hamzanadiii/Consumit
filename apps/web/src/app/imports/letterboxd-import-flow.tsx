'use client'

import type { LetterboxdImportDetail, LetterboxdImportItem } from '@consumit/contracts'
import { AlertTriangle, Check, FileArchive, RefreshCw, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useEffect, useId, useState } from 'react'

import { Button, Input, buttonVariants } from '@consumit/ui'

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
    <article className="rounded-card border border-border bg-surface-raised p-5">
      <p className="text-sm font-bold text-ink">{item.title ?? 'Untitled row'} {item.year ? <span className="font-normal text-muted">({item.year})</span> : null}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.08em] text-orange">{item.status.replace('_', ' ')}</p>
      {item.candidates.length ? <div className="mt-4 flex flex-wrap gap-2">{item.candidates.map((candidate) => <Button disabled={busy} key={candidate.id} onClick={() => void choose({ tmdbId: candidate.id })} size="sm" variant="secondary">{candidate.title}{candidate.year ? ` · ${candidate.year}` : ''}</Button>)}</div> : null}
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event: FormEvent) => { event.preventDefault(); const id = Number(tmdbId); if (Number.isInteger(id) && id > 0) void choose({ tmdbId: id }) }}>
        <Input aria-label={`TMDB ID for ${item.title ?? 'row'}`} className="max-w-40" inputMode="numeric" onChange={(event) => setTmdbId(event.currentTarget.value)} placeholder="TMDB movie ID" value={tmdbId} />
        <Button disabled={busy || !tmdbId} size="sm" type="submit">Use ID</Button>
        <Button disabled={busy} onClick={() => void choose({ skip: true })} size="sm" type="button" variant="ghost">Skip row</Button>
      </form>
    </article>
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

  if (state === 'loading') return <p className="text-sm text-muted" role="status">Loading your imports…</p>
  const reviewable = detail?.items.filter((item) => item.status === 'needs_review' || item.status === 'unmatched') ?? []
  return (
    <div className="space-y-6" data-consumit-letterboxd-import>
      {!detail || detail.import.status === 'confirmed' ? (
        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-control-outline bg-surface p-7 text-center hover:border-orange" htmlFor={inputId}>
          <Upload aria-hidden="true" className="size-7 text-orange" />
          <span className="mt-4 text-sm font-bold text-ink">Upload Letterboxd ZIP or CSV</span>
          <span className="mt-2 max-w-lg text-xs leading-5 text-muted">We stage and match your export, then show uncertain titles before anything changes in your profile.</span>
          <input accept=".zip,.csv,application/zip,text/csv" className="sr-only" disabled={state === 'uploading'} id={inputId} onChange={(event) => void upload(event.currentTarget.files?.[0])} type="file" />
        </label>
      ) : null}

      {detail ? <section className="rounded-card border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-bold text-ink"><FileArchive aria-hidden="true" className="size-4 text-orange" /> Letterboxd import</p><p className="mt-2 text-xs uppercase tracking-[0.08em] text-muted">{detail.import.status.replace('_', ' ')}</p></div><p className="text-xs text-muted">{detail.import.progress.exact + detail.import.progress.confident + detail.import.progress.skipped} / {detail.import.progress.total} resolved</p></div>
        {['uploaded', 'processing'].includes(detail.import.status) ? <p className="mt-6 text-sm text-copy" role="status">Matching titles against TMDB. You can leave this page; progress is saved.</p> : null}
        {detail.import.status === 'failed' ? <div className="mt-6 flex items-start gap-3 text-sm text-coral"><AlertTriangle aria-hidden="true" className="size-5" /><div><p>{detail.import.failedReason}</p><Button className="mt-4" disabled={state === 'working'} onClick={() => void action(() => retryLetterboxdImport(detail.import.id))} size="sm"><RefreshCw aria-hidden="true" /> Retry matching</Button></div></div> : null}
        {reviewable.length ? <div className="mt-7 space-y-3"><h3 className="text-sm font-bold text-ink">Review uncertain titles</h3>{reviewable.map((item) => <ReviewItem detail={detail} item={item} key={item.id} onChange={setDetail} />)}</div> : null}
        {detail.import.status === 'ready' ? <div className="mt-7"><p className="text-sm text-copy">Every row is resolved. Confirm to populate your real profile and library.</p><Button className="mt-4" disabled={state === 'working'} onClick={() => void action(() => confirmLetterboxdImport(detail.import.id))} variant="accent"><Check aria-hidden="true" /> Confirm import</Button></div> : null}
        {detail.import.status === 'confirmed' ? <div className="mt-7"><p className="text-sm text-lime">Import complete. Your real member data is ready.</p><div className="mt-4 flex flex-wrap gap-3"><Link className={buttonVariants({ size: 'lg', variant: 'accent' })} href={completeHref}>View your library</Link>{confirmDelete ? <><Button disabled={state === 'working'} onClick={() => void action(async () => { await deleteLetterboxdData(); setDetail(null); setConfirmDelete(false) }, false)} variant="danger"><Trash2 aria-hidden="true" /> Confirm removal</Button><Button onClick={() => setConfirmDelete(false)} variant="ghost">Keep imported data</Button></> : <Button onClick={() => setConfirmDelete(true)} variant="ghost"><Trash2 aria-hidden="true" /> Remove imported data</Button>}</div>{confirmDelete ? <p className="mt-3 text-xs leading-5 text-muted">Only untouched Letterboxd-owned records are removed. Native records and imported records you edited remain.</p> : null}</div> : null}
        {detail.import.status !== 'confirmed' ? <Button className="mt-7" disabled={state === 'working'} onClick={() => void action(async () => { await discardLetterboxdImport(detail.import.id); setDetail(null) }, false)} variant="ghost"><Trash2 aria-hidden="true" /> Discard staged import</Button> : null}
      </section> : null}
      {state === 'uploading' ? <p className="text-sm text-muted" role="status">Uploading and validating your export…</p> : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  )
}
