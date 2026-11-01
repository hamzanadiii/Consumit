'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { z } from 'zod'
import { tasteDraftReadSchema, tasteReviewSchema } from '@consumit/contracts'
import { RatingInput } from '@consumit/ui'
import { getMemberTitleState } from '@/lib/identity-browser'
import { useSession } from '../session/session'
import { TasteDialog } from '../taste/primitives'
import { tasteRead, tasteWrite, errorText } from '../taste/api'

export type LogDialogExistingReview = { body: string; reviewId: string; reviewedOn: string | null }
type Props = { existingReview?: LogDialogExistingReview | null | undefined; id: number; kind: 'movie' | 'series' | 'anime'; onClose: () => void; onSaved: (review?: LogDialogExistingReview) => void; posterUrl?: string | undefined; episode?: number | undefined; season?: number | undefined; title: string; watchedOn?: string | undefined; year?: number | null | undefined; mode?: 'review' | 'log' }
const formSchema = z.object({ body: z.string(), date: z.string(), rewatch: z.boolean(), spoiler: z.boolean(), rating: z.number().nullable(), tags: z.string() })
const publicationSchema = z.object({ reviewId: z.string().nullable() })
const recoverySchema = z.object({ baseReviewRevision: z.int().nonnegative().optional(), pendingPublication: z.object({ input: z.string(), key: z.uuid() }).nullable().optional() })
type Form = z.infer<typeof formSchema>
function localToday() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

export function LogDialog(props: Props) {
  const session = useSession()
  return session.member ? <Composer key={`${session.member.id}:${props.kind}:${props.id}:${props.season ?? 'title'}:${props.episode ?? 'title'}:${props.mode ?? 'log'}:${props.existingReview?.reviewId ?? ''}`} {...props} /> : null
}
function Composer({ existingReview, id, kind, onClose, onSaved, episode, season, posterUrl, title, watchedOn, mode = 'log' }: Props) {
  const intent = existingReview ? 'review' : mode
  const key = existingReview ? `review-${kind}-${id}-${existingReview.reviewId}` : `${intent}-${kind}-${id}-${season ?? 'title'}-${episode ?? 'title'}-new`
  const [scope, setScope] = useState({ season, episode })
  const [form, setForm] = useState<Form>({ body: existingReview?.body ?? '', date: watchedOn ?? localToday(), rewatch: false, spoiler: false, rating: null, tags: '' })
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [errorAction, setErrorAction] = useState<'load' | 'draft' | 'publish' | null>(null), [publicationFailed, setPublicationFailed] = useState(false), [status, setStatus] = useState('Loading your draft…'), [retry, setRetry] = useState(0), [preview, setPreview] = useState(false)
  const revision = useRef(0), reviewRevision = useRef(0), saved = useRef(''), attempt = useRef<{ input: string; key: string } | null>(null), pending = useRef<Promise<void> | null>(null)
  const publishButton = useRef<HTMLButtonElement>(null), focusPublishAfterFailure = useRef(false)
  useEffect(() => {
    let active = true
    void Promise.all([tasteRead(`drafts/${key}`, tasteDraftReadSchema), getMemberTitleState({ id, kind }), existingReview ? tasteRead(`reviews/${existingReview.reviewId}`, tasteReviewSchema) : null]).then(([draft, state, review]) => {
      if (!active) return
      revision.current = draft.revision
      const recovered = formSchema.safeParse(draft.data)
      const recovery = recoverySchema.parse(draft.data)
      reviewRevision.current = recovered.success && existingReview ? recovery.baseReviewRevision ?? 0 : review?.revision ?? 0
      attempt.current = recovered.success ? recovery.pendingPublication ?? null : null
      setScope(review ? { season: review.season ?? undefined, episode: review.episode ?? undefined } : { season, episode })
      const next = recovered.success ? recovered.data : { body: review?.body ?? existingReview?.body ?? '', date: watchedOn ?? localToday(), rewatch: false, spoiler: review?.spoiler ?? false, rating: state.rating?.value ?? null, tags: '' }
      saved.current = JSON.stringify(next); setForm(next); setReady(true); setError(''); setErrorAction(null); setStatus(recovered.success ? 'Private draft restored.' : 'Only published work appears on your profile.')
    }).catch(cause => { if (active) { setError(errorText(cause)); setErrorAction('load'); setStatus('Your existing records have not changed.') } })
    return () => { active = false }
  }, [key, id, kind, existingReview, watchedOn, retry, season, episode])
  const current = useRef(form)
  useEffect(() => { current.current = form }, [form])
  async function persist(force = false) {
    if (pending.current) await pending.current
    const value = current.current, serialized = JSON.stringify(value)
    if (!ready || !force && saved.current === serialized) return
    const operation = tasteWrite(`drafts/${key}`, { revision: revision.current, data: { ...value, baseReviewRevision: reviewRevision.current, pendingPublication: attempt.current } }, 'PUT', tasteDraftReadSchema).then(result => { revision.current = result.revision; saved.current = serialized; setStatus('Private draft saved.'); setError(''); setErrorAction(null) }).catch(cause => { setError(errorText(cause)); setErrorAction('draft'); throw cause }).finally(() => { pending.current = null })
    pending.current = operation
    await operation
  }
  useEffect(() => {
    if (!ready || busy || error || saved.current === JSON.stringify(form)) return
    const timer = setTimeout(() => { void persist().catch(() => undefined) }, 1000)
    return () => clearTimeout(timer)
    // persist reads the current draft through refs; never persist a stale render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, ready, busy, error])
  useEffect(() => {
    if (!busy && error && focusPublishAfterFailure.current) {
      focusPublishAfterFailure.current = false
      publishButton.current?.focus()
    }
  }, [busy, error])
  async function close() { if (busy) return; setBusy(true); try { await persist(); onClose() } catch { setBusy(false) } }
  async function publish() {
    setBusy(true); setError(''); setErrorAction(null); setPublicationFailed(false)
    let publicationRequestSent = false
    try {
      await persist()
      const input = { id, kind, body: form.body, spoiler: form.spoiler, rating: form.rating, ...(existingReview ? { reviewId: existingReview.reviewId, revision: reviewRevision.current } : {}), ...(scope.episode === undefined ? {} : { episode: scope.episode }), ...(scope.season === undefined ? {} : { season: scope.season }), ...(intent === 'log' ? { log: { watchedOn: form.date, rewatch: form.rewatch, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 50) } } : {}) }
      const serialized = JSON.stringify(input)
      if (attempt.current?.input !== serialized) attempt.current = { input: serialized, key: crypto.randomUUID() }
      // Store the exact attempt before sending: a lost response must remain retryable after remount.
      await persist(true)
      publicationRequestSent = true
      const publication = await tasteWrite('reviews', { ...input, idempotencyKey: attempt.current.key }, 'POST', publicationSchema)
      // Publication succeeded even if clearing the recoverable private draft fails.
      await tasteWrite(`drafts/${key}`, { revision: revision.current, data: {} }).catch(() => undefined)
      onSaved(publication.reviewId && form.body.trim()
        ? { reviewId: publication.reviewId, body: form.body.trim(), reviewedOn: existingReview?.reviewedOn ?? (intent === 'log' ? form.date : null) }
        : undefined)
    } catch (cause) { focusPublishAfterFailure.current = true; setPublicationFailed(publicationRequestSent); setErrorAction(publicationRequestSent ? 'publish' : 'draft'); setError(errorText(cause)); setBusy(false) }
  }
  return <TasteDialog className="taste-log-dialog" title={intent === 'review' ? existingReview ? 'Edit your review' : 'In your own words' : 'Remember this watch'} onClose={() => void close()}>
    <div className="taste-form taste-log-composer"><div className="taste-log-title">{posterUrl ? <span className="taste-log-poster"><Image alt="" fill sizes="40px" src={posterUrl} /></span> : null}<div><h3>{title}</h3><p className="taste-muted">{scope.episode === undefined ? kind : `${kind === 'series' ? `Season ${scope.season} · ` : ''}Episode ${scope.episode}`}</p></div></div>
      <fieldset disabled={!ready || busy} className="taste-form taste-log-fields">
        <div className="taste-log-rating"><RatingInput label={`Rate ${title} out of 5 stars`} name={`taste-${kind}-${id}`} value={form.rating} disabled={!ready || busy} onChange={rating => setForm({ ...form, rating })} /><p className="taste-muted">{scope.episode === undefined ? 'Optional. Your rating can stand on its own.' : 'This rating applies to the whole title. Your review keeps its episode context.'}</p></div>
        {intent === 'log' ? <div className="taste-editor-grid"><label>Watched on<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label><label className="taste-check"><input type="checkbox" checked={form.rewatch} onChange={e => setForm({ ...form, rewatch: e.target.checked })} />This was a rewatch</label></div> : null}
        {preview ? <article className="taste-review-body">{form.body || 'Your words will appear here.'}</article> : <label>{intent === 'review' ? 'Your review' : 'Add a review, if you want'}<textarea rows={5} maxLength={10000} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="What stayed with you?" /></label>}
        <div className="taste-actions"><label className="taste-check"><input type="checkbox" checked={form.spoiler} onChange={e => setForm({ ...form, spoiler: e.target.checked })} />Contains spoilers</label><button className="taste-button" onClick={() => setPreview(!preview)}>{preview ? 'Keep writing' : 'Preview'}</button></div>
        {intent === 'log' ? <label>Tags <span className="taste-muted">Separate with commas</span><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} maxLength={1000} /></label> : <p className="taste-muted">Publishing a review does not log a watch. Your Reviews visibility setting controls who can read it.</p>}
      </fieldset>
      <p className="taste-muted taste-log-status" role="status">{status}</p>
      <div className="taste-log-feedback">
        {error ? <p className="taste-status" role="alert">{error} {errorAction === 'load' ? <button className="taste-button" onClick={() => { setError(''); setErrorAction(null); setRetry(x => x + 1) }}>Retry loading</button> : errorAction === 'draft' ? <button className="taste-button" onClick={() => { setError(''); setErrorAction(null); void persist().catch(() => undefined) }}>Retry draft save</button> : null}</p> : null}
        <div className="taste-actions taste-log-commit"><button className="taste-button" disabled={busy} onClick={() => void close()}>Save draft &amp; close</button><button ref={publishButton} className="taste-button taste-button-primary" disabled={!ready || busy || intent === 'review' && !form.body.trim()} onClick={() => void publish()}>{busy ? 'Saving…' : intent === 'review' ? existingReview ? publicationFailed ? 'Retry saving review' : 'Save review' : publicationFailed ? 'Retry publishing' : 'Publish review' : publicationFailed ? 'Retry saving watch' : 'Save watch'}</button></div>
      </div>
    </div>
  </TasteDialog>
}
