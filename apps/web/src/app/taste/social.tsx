'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { z } from 'zod'
import { tasteDiscussionSchema, tasteNotificationsSchema, tasteReportsSchema, type TasteTarget } from '@consumit/contracts'
import { useSession } from '../session/session'
import { formatTasteDate, Spoiler, TasteDialog } from './primitives'
import { tasteRead, tasteWrite, errorText, isTasteConflict } from './api'

const subscriptionSchema = z.object({ subscribed: z.boolean(), muted: z.boolean() })
type RecoverablePublicationAction = { kind: 'report' | 'block' | 'subscription'; label: string; action: () => Promise<unknown>; success: string }
type ReplyMuteMode = 'mute' | 'unmute'
type CommentDraft = { body: string; spoiler: boolean }
type TasteComment = z.infer<typeof tasteDiscussionSchema>['items'][number]

function commentDraftKey(parentId: string | null, editId: string | null) {
  return editId ? `edit:${editId}` : parentId ? `reply:${parentId}` : 'new'
}

export function PublicationActions({ target, subscribe = false, commentId, memberId, onBlocked }: { target: TasteTarget; subscribe?: boolean; commentId?: string | undefined; memberId?: string | undefined; onBlocked?: (() => void) | undefined }) {
  const session = useSession()
  return session.member ? <PublicationActionsContent key={`${session.member.id}:${target.kind}:${target.id}`} target={target} subscribe={subscribe} commentId={commentId} memberId={memberId} onBlocked={onBlocked} /> : null
}
function PublicationActionsContent({ target, subscribe, commentId, memberId, onBlocked }: { target: TasteTarget; subscribe: boolean; commentId?: string | undefined; memberId?: string | undefined; onBlocked?: (() => void) | undefined }) {
  const session = useSession()
  const router = useRouter()
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [failedAction, setFailedAction] = useState<RecoverablePublicationAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [memberBlocked, setMemberBlocked] = useState(false)
  const [subscriptionState, setSubscriptionState] = useState<'checking' | 'ready' | 'error'>(subscribe ? 'checking' : 'ready')
  const [subscriptionError, setSubscriptionError] = useState('')
  const reportIdempotencyKey = useRef<string | null>(null)
  const subscriptionButton = useRef<HTMLButtonElement>(null)
  const actionButton = useRef<HTMLButtonElement>(null)
  const manageBlockedButton = useRef<HTMLAnchorElement>(null)
  const focusManageBlockedAfterSuccess = useRef(false)
  const focusSubscriptionAfterRetry = useRef(false)
  const subscriptionPath = `subscriptions/${target.kind}/${target.id}`

  useEffect(() => {
    if (!subscribe) return
    const controller = new AbortController()
    void tasteRead(subscriptionPath, subscriptionSchema, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        setSubscribed(result.subscribed)
        setSubscriptionState('ready')
        setSubscriptionError('')
      })
      .catch(cause => {
        if (controller.signal.aborted) return
        setSubscriptionError(errorText(cause))
        setSubscriptionState('error')
      })
    return () => controller.abort()
  }, [subscribe, subscriptionPath])

  useEffect(() => {
    if (subscriptionState !== 'ready' || !focusSubscriptionAfterRetry.current) return
    focusSubscriptionAfterRetry.current = false
    subscriptionButton.current?.focus()
  }, [subscriptionState])

  useEffect(() => {
    if (failedAction) actionButton.current?.focus()
  }, [failedAction])

  useEffect(() => {
    if (!memberBlocked || !focusManageBlockedAfterSuccess.current) return
    focusManageBlockedAfterSuccess.current = false
    manageBlockedButton.current?.focus()
  }, [memberBlocked])

  async function retrySubscription() {
    focusSubscriptionAfterRetry.current = true
    setSubscriptionState('checking')
    try {
      const result = await tasteRead(subscriptionPath, subscriptionSchema)
      setSubscribed(result.subscribed)
      setSubscriptionError('')
      setSubscriptionState('ready')
    } catch (cause) {
      focusSubscriptionAfterRetry.current = false
      setSubscriptionError(errorText(cause))
      setSubscriptionState('error')
    }
  }

  async function act(intent: RecoverablePublicationAction) {
    setBusy(true)
    setActionError('')
    setMessage('')
    setFailedAction(null)
    try { await intent.action(); setMessage(intent.success) }
    catch (e) { setActionError(errorText(e)); setFailedAction(intent) }
    finally { setBusy(false) }
  }

  if (!session.member) return null
  return (
    <div>
      <div className="taste-actions">
        {subscribe ? (
          <button
            aria-pressed={subscribed}
            className="taste-button"
            disabled={busy || subscriptionState !== 'ready'}
            onClick={() => void act({
              kind: 'subscription',
              label: 'Retry notification update',
              action: async () => {
                await tasteWrite(subscriptionPath, { mode: subscribed ? 'off' : 'updates' })
                setSubscribed(!subscribed)
              },
              success: subscribed ? 'Update notifications off.' : 'You’ll hear when the curator publishes an update.',
            })}
            ref={subscriptionButton}
          >
            {subscriptionState === 'checking' ? 'Checking updates…' : subscriptionState === 'error' ? 'Updates unavailable' : subscribed ? 'Updates on' : 'Notify me about updates'}
          </button>
        ) : null}
        <button className="taste-button" disabled={busy} onClick={() => setReporting(true)}>Report</button>
        {memberId && memberId !== session.member.id ? memberBlocked ? (
          <Link className="taste-button" href="/community/settings" ref={manageBlockedButton}>Manage blocked members</Link>
        ) : (
          <button
            className="taste-button"
            disabled={busy}
            onClick={() => void act(failedAction?.kind === 'block' ? failedAction : {
              kind: 'block',
              label: 'Retry block member',
              action: async () => {
                await tasteWrite(`blocks/${memberId}`, { enabled: true })
                focusManageBlockedAfterSuccess.current = true
                setMemberBlocked(true)
                onBlocked?.()
                router.refresh()
              },
              success: 'Member blocked. Manage blocked members in Community settings.',
            })}
            ref={failedAction?.kind === 'block' ? actionButton : undefined}
          >
            {busy && failedAction?.kind === 'block' ? 'Blocking…' : failedAction?.kind === 'block' ? 'Retry block member' : 'Block member'}
          </button>
        ) : null}
      </div>
      {subscribe && subscriptionState === 'checking' && !subscriptionError ? <p className="taste-status" role="status">Checking whether you receive publication updates…</p> : null}
      {subscribe && subscriptionError && subscriptionState !== 'ready' ? (
        <div className="taste-status">
          <p role={subscriptionState === 'checking' ? 'status' : 'alert'}>{subscriptionState === 'checking' ? 'Checking whether you receive publication updates…' : subscriptionError}</p>
          <button
            aria-disabled={subscriptionState === 'checking'}
            className="taste-button"
            onClick={() => { if (subscriptionState !== 'checking') void retrySubscription() }}
            type="button"
          >
            {subscriptionState === 'checking' ? 'Checking notification preferences…' : 'Retry checking notification preferences'}
          </button>
        </div>
      ) : null}
      {actionError && failedAction?.kind === 'subscription' ? (
        <div className="taste-status" role="alert">
          <p>{actionError} Your current setting is unchanged.</p>
          <button className="taste-button" disabled={busy} onClick={() => void act(failedAction)} ref={actionButton} type="button">{failedAction.label}</button>
        </div>
      ) : null}
      {actionError && failedAction?.kind === 'block' ? (
        <p className="taste-status" role="alert">{actionError} Retry block member to try the same change again.</p>
      ) : null}
      {message ? <p className="taste-status" role="status">{message}</p> : null}
      {reporting ? (
        <TasteDialog className="taste-action-dialog" title="Report this content" onClose={() => setReporting(false)}>
          <div className="taste-form">
            <label>What should we know?<textarea value={reason} disabled={busy || failedAction?.kind === 'report'} onChange={e => setReason(e.target.value)} maxLength={1000} /></label>
            {actionError && failedAction?.kind === 'report' ? <p className="taste-status" role="alert">{actionError} Your reason is still here. Retry sending the report to try the same request again.</p> : null}
            <button
              className="taste-button taste-button-primary"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void act(failedAction?.kind === 'report' ? failedAction : {
                kind: 'report',
                label: 'Retry sending report',
                action: async () => {
                  const idempotencyKey = reportIdempotencyKey.current ?? crypto.randomUUID()
                  reportIdempotencyKey.current = idempotencyKey
                  await tasteWrite('reports', { ...target, reason, idempotencyKey, ...(commentId ? { commentId } : {}) }, 'POST')
                  setReporting(false)
                  reportIdempotencyKey.current = null
                },
                success: 'Report received for review.',
              })}
              ref={failedAction?.kind === 'report' ? actionButton : undefined}
            >
              {busy ? 'Sending report…' : failedAction?.kind === 'report' ? 'Retry sending report' : 'Send report'}
            </button>
          </div>
        </TasteDialog>
      ) : null}
    </div>
  )
}

export function Discussion({ target }: { target: TasteTarget }) {
  const session = useSession()
  return <DiscussionContent key={`${session.member?.id ?? 'guest'}:${target.kind}:${target.id}`} target={target} signedIn={Boolean(session.member)} />
}
function DiscussionContent({ target, signedIn }: { target: TasteTarget; signedIn: boolean }) {
  const returnPath = usePathname() ?? '/community'
  const [data, setData] = useState<z.infer<typeof tasteDiscussionSchema> | null>(null)
  const [body, setBody] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [parentId, setParentId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editConflictId, setEditConflictId] = useState<string | null>(null)
  const [editConflictLatest, setEditConflictLatest] = useState<TasteComment | null>(null)
  const [editConflictLoadError, setEditConflictLoadError] = useState('')
  const [editConflictRemoved, setEditConflictRemoved] = useState(false)
  const editingConflict = Boolean(editId && editConflictId === editId)
  const [loadError, setLoadError] = useState('')
  const [sendError, setSendError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failedCursor, setFailedCursor] = useState<string | null>(null)
  const [loadPageFocusId, setLoadPageFocusId] = useState<string | null>(null)
  const [sendFailed, setSendFailed] = useState(false)
  const [sendStatus, setSendStatus] = useState('')
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null)
  const [deleteFailedId, setDeleteFailedId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')
  const [muteError, setMuteError] = useState('')
  const [muteStatus, setMuteStatus] = useState('')
  const [blockedStatus, setBlockedStatus] = useState('')
  const [mutePending, setMutePending] = useState(false)
  const [muteRetryMode, setMuteRetryMode] = useState<ReplyMuteMode | null>(null)
  const drafts = useRef(new Map<string, CommentDraft>())
  const attempts = useRef(new Map<string, { text: string; key: string }>())
  const commentCursors = useRef(new Map<string, string | null>())
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const keepCommentRef = useRef<HTMLButtonElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const muteButtonRef = useRef<HTMLButtonElement>(null)
  const loadRetryButtonRef = useRef<HTMLButtonElement>(null)
  const commentsRef = useRef<HTMLElement>(null)
  const focusMuteButtonAfterSuccess = useRef(false)
  const focusDiscussionHeadingAfterRetry = useRef(false)
  const discussionHeadingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (sendFailed) sendButtonRef.current?.focus() }, [sendFailed])
  useEffect(() => {
    if (editingConflict && !editConflictLatest && !editConflictRemoved && !busy) sendButtonRef.current?.focus()
  }, [editingConflict, editConflictLatest, editConflictRemoved, busy, editConflictLoadError])
  useEffect(() => { if (sendStatus && !busy) commentInputRef.current?.focus() }, [sendStatus, busy])
  useEffect(() => { if (deleteError) deleteButtonRef.current?.focus() }, [deleteError])
  useEffect(() => { if (deleteStatus) discussionHeadingRef.current?.focus() }, [deleteStatus])
  useEffect(() => { if (loadError && !busy) loadRetryButtonRef.current?.focus() }, [loadError, busy])
  useEffect(() => {
    if (loadPageFocusId) {
      const loadedComment = Array.from(commentsRef.current?.querySelectorAll<HTMLElement>('[data-discussion-comment]') ?? [])
        .find(comment => comment.dataset.discussionComment === loadPageFocusId)
      const authorLink = loadedComment?.querySelector<HTMLAnchorElement>('a[href]')
      if (authorLink) {
        authorLink.focus()
        focusDiscussionHeadingAfterRetry.current = false
        setLoadPageFocusId(null)
        return
      }
    }
    if (focusDiscussionHeadingAfterRetry.current && !loadError && !busy && !loadPageFocusId) {
      focusDiscussionHeadingAfterRetry.current = false
      discussionHeadingRef.current?.focus()
    }
  }, [loadPageFocusId, loadError, busy, data?.items])
  useEffect(() => {
    if (muteRetryMode && !mutePending) {
      muteButtonRef.current?.focus()
      return
    }
    if (focusMuteButtonAfterSuccess.current && !busy && !mutePending) {
      focusMuteButtonAfterSuccess.current = false
      muteButtonRef.current?.focus()
    }
  }, [muteRetryMode, mutePending, busy])
  const path = `discussion/${target.kind}/${target.id}`
  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    try {
      const next = await tasteRead(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, tasteDiscussionSchema, signal)
      if (signal?.aborted) return
      for (const comment of next.items) commentCursors.current.set(comment.id, cursor ?? null)
      setData(old => cursor && old ? { ...next, items: [...old.items, ...next.items] } : next)
      setLoadError('')
      setFailedCursor(null)
      if (cursor) setLoadPageFocusId(next.items[0]?.id ?? null)
    } catch (cause) {
      if (signal?.aborted) return
      setLoadError(errorText(cause))
      setFailedCursor(cursor ?? null)
      setLoadPageFocusId(null)
    }
  }, [path])
  // Network completion updates state asynchronously; the loader is also reused after mutations.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const controller = new AbortController(); void load(undefined, controller.signal); return () => controller.abort() }, [load])
  function switchComposer(nextParentId: string | null, nextEditId: string | null, initial?: CommentDraft) {
    drafts.current.set(commentDraftKey(parentId, editId), { body, spoiler })
    const nextKey = commentDraftKey(nextParentId, nextEditId)
    const nextDraft = drafts.current.get(nextKey) ?? initial ?? { body: '', spoiler: false }
    drafts.current.set(nextKey, nextDraft)
    setParentId(nextParentId)
    setEditId(nextEditId)
    setBody(nextDraft.body)
    setSpoiler(nextDraft.spoiler)
    setSendFailed(false)
    setSendStatus('')
    setSendError('')
    setEditConflictId(null)
    setEditConflictLatest(null)
    setEditConflictLoadError('')
    setEditConflictRemoved(false)
  }
  function cancelComposer() {
    drafts.current.delete(commentDraftKey(parentId, editId))
    const rootDraft = drafts.current.get('new') ?? { body: '', spoiler: false }
    setParentId(null)
    setEditId(null)
    setBody(rootDraft.body)
    setSpoiler(rootDraft.spoiler)
    setSendFailed(false)
    setSendStatus('')
    setSendError('')
    setEditConflictId(null)
    setEditConflictLatest(null)
    setEditConflictLoadError('')
    setEditConflictRemoved(false)
  }
  async function loadLatestComment(id: string) {
    const cursor = commentCursors.current.get(id) ?? null
    setBusy(true)
    setEditConflictLoadError('')
    try {
      const latestPage = await tasteRead(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, tasteDiscussionSchema)
      const latest = latestPage.items.find(comment => comment.id === id)
      if (!latest) throw new Error('The latest version of this comment could not be found. Your draft is still here; try loading again.')
      if (latest.deleted) {
        setEditConflictRemoved(true)
        setSendError('This comment was removed while you were editing. Your draft is still here, but the removed comment cannot be overwritten.')
        return
      }
      commentCursors.current.set(id, cursor)
      setEditConflictLatest(latest)
      setSendError('')
      setSendFailed(false)
      setSendStatus('Latest saved version loaded. Your draft is still here.')
    } catch (cause) {
      setEditConflictLoadError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  async function send() {
    const draftKey = commentDraftKey(parentId, editId)
    if (editId && editConflictId === editId && !editConflictLatest) return
    setBusy(true); setSendError(''); setSendStatus(''); setSendFailed(false)
    try {
      if (editId) {
        const base = editingConflict ? editConflictLatest : data!.items.find(c => c.id === editId)
        if (!base) throw new Error('This comment is no longer available to edit. Your draft is still here.')
        await tasteWrite(`comments/${editId}`, { body, spoiler, revision: base.revision }, 'PATCH')
      }
      else {
        const text = JSON.stringify({ body, spoiler, parentId })
        let currentAttempt = attempts.current.get(draftKey)
        if (!currentAttempt || currentAttempt.text !== text) {
          currentAttempt = { text, key: crypto.randomUUID() }
          attempts.current.set(draftKey, currentAttempt)
        }
        await tasteWrite(path, { body, spoiler, parentId, idempotencyKey: currentAttempt.key }, 'POST')
      }
      setSendStatus(editId ? 'Comment saved.' : parentId ? 'Reply posted.' : 'Comment posted.')
      drafts.current.delete(draftKey)
      attempts.current.delete(draftKey)
      if (editId) {
        const savedId = editId
        const savedBody = body
        const savedSpoiler = spoiler
        const revision = editingConflict ? editConflictLatest?.revision : data?.items.find(comment => comment.id === editId)?.revision
        setData(current => current ? { ...current, items: current.items.map(comment => comment.id === savedId ? { ...comment, body: savedBody, spoiler: savedSpoiler, revision: (revision ?? comment.revision) + 1 } : comment) } : current)
      }
      setBody(''); setSpoiler(false); setParentId(null); setEditId(null)
      setEditConflictId(null); setEditConflictLatest(null); setEditConflictLoadError(''); setEditConflictRemoved(false)
      if (!editId) await load()
    } catch (cause) {
      if (editId && isTasteConflict(cause)) {
        setEditConflictId(editId)
        setEditConflictLatest(null)
        setEditConflictLoadError('')
        setEditConflictRemoved(false)
        setSendError('This comment changed in another window. Your draft is still here. Load the latest version before saving.')
        setSendFailed(false)
      } else {
        setSendError(errorText(cause))
        setSendFailed(true)
      }
    } finally { setBusy(false) }
  }
  async function remove(id: string) {
    setBusy(true)
    setDeleteError('')
    setDeleteStatus('')
    setDeleteFailedId(null)
    try {
      await tasteWrite(`comments/${id}`, undefined, 'DELETE')
      setDeleteConfirmationId(null)
      setDeleteStatus('Comment deleted.')
      await load()
    } catch (e) {
      setDeleteFailedId(id)
      setDeleteError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function updateReplyMute(mode: ReplyMuteMode) {
    setBusy(true)
    setMutePending(true)
    setMuteError('')
    setMuteStatus('')
    setMuteRetryMode(null)
    try {
      await tasteWrite(`subscriptions/${target.kind}/${target.id}`, { mode })
      setData(current => current ? { ...current, muted: mode === 'mute' } : current)
      setMuteStatus(mode === 'mute' ? 'Replies muted.' : 'Replies unmuted.')
      focusMuteButtonAfterSuccess.current = true
    } catch (cause) {
      setMuteError(errorText(cause))
      setMuteRetryMode(mode)
    } finally {
      setBusy(false)
      setMutePending(false)
    }
  }
  const deletingComment = data?.items.find(comment => comment.id === deleteConfirmationId)
  return (
    <section className="taste-comments" ref={commentsRef}>
      <div className="taste-section-heading">
        <h2 ref={discussionHeadingRef} tabIndex={-1}>The conversation</h2>
        {signedIn && data ? <button className="taste-button" disabled={busy} onClick={() => void updateReplyMute(muteRetryMode ?? (data.muted ? 'unmute' : 'mute'))} ref={muteButtonRef}>
          {mutePending ? 'Updating reply settings…' : muteRetryMode ? `Retry ${muteRetryMode === 'mute' ? 'muting' : 'unmuting'} replies` : data.muted ? 'Unmute replies' : 'Mute replies'}
        </button> : null}
      </div>
      {muteError ? <p role="alert" className="taste-status">{muteError} We couldn’t confirm this change. Retry to apply the same choice.</p> : null}
      {muteStatus ? <p role="status" className="taste-status">{muteStatus}</p> : null}
      {blockedStatus ? <p role="status" className="taste-status">{blockedStatus} <Link className="taste-button" href="/community/settings">Manage blocked members</Link></p> : null}
      {!data && !loadError ? <p role="status">Loading discussion…</p> : null}
      {data && !data.items.length ? <p className="taste-empty">{signedIn && !data.canComment ? 'No comments yet.' : 'Start with a thought, a question, or a different reading.'}</p> : null}
      {data?.items.map(comment => (
        <article className="taste-comment" data-discussion-comment={comment.id} data-reply={Boolean(comment.parentId)} key={comment.id}>
          <header>
            <Link href={`/profile/${comment.author.username}`}><strong>{comment.author.name}</strong></Link>
            <time className="taste-muted" dateTime={comment.createdAt}>{formatTasteDate(comment.createdAt)}</time>
            {comment.parentId ? <small>Reply to {data.items.find(parent => parent.id === comment.parentId)?.author.name ?? 'an earlier comment'}</small> : null}
          </header>
          {comment.deleted ? <p className="taste-muted">Comment removed.</p> : <Spoiler hidden={comment.spoiler}><p>{comment.body}</p></Spoiler>}
          <div className="taste-actions">
            {signedIn && data.canComment && !comment.deleted && !comment.parentId ? <button onClick={() => { switchComposer(comment.id, null); document.getElementById(`reply-${target.id}`)?.focus() }}>Reply</button> : null}
            {comment.owner && !comment.deleted ? <>
              {data.canComment ? <button disabled={busy} onClick={() => switchComposer(null, comment.id, { body: comment.body, spoiler: comment.spoiler })}>Edit</button> : null}
              <button disabled={busy} onClick={() => { setDeleteConfirmationId(comment.id); setDeleteFailedId(null); setDeleteError('') }}>Delete</button>
            </> : null}
            {!comment.deleted && !comment.owner ? <PublicationActions target={target} commentId={comment.id} memberId={comment.author.id} onBlocked={() => {
              focusDiscussionHeadingAfterRetry.current = true
              setBlockedStatus('Member blocked. Their comments are hidden in this discussion.')
              setData(current => current ? { ...current, items: current.items.filter(item => item.author.id !== comment.author.id) } : current)
            }} /> : null}
          </div>
        </article>
      ))}
      {data?.nextCursor ? <button className="taste-button" disabled={busy || Boolean(loadError)} onClick={() => { setBusy(true); void load(data.nextCursor!).finally(() => setBusy(false)) }}>More comments</button> : null}
      {loadError ? <p role="alert" className="taste-status">{loadError} <button className="taste-button" disabled={busy} onClick={() => { focusDiscussionHeadingAfterRetry.current = true; setBusy(true); void load(failedCursor ?? undefined).finally(() => setBusy(false)) }} ref={loadRetryButtonRef}>{busy ? 'Loading comments…' : 'Retry loading'}</button></p> : null}
      {data && signedIn && !data.canComment ? <p className="taste-muted" role="status">Your account is currently restricted from publishing or commenting.</p> : null}
      {data?.canComment ? (
        <div className="taste-form" style={{ marginTop: 24 }}>
          <label>{editId ? 'Edit your comment' : parentId ? 'Your reply' : 'Join the conversation'}<textarea id={`reply-${target.id}`} value={body} maxLength={2000} disabled={busy} onChange={event => { const nextBody = event.target.value; setBody(nextBody); drafts.current.set(commentDraftKey(parentId, editId), { body: nextBody, spoiler }); setSendStatus(''); if (sendFailed) { setSendFailed(false); setSendError('') } }} ref={commentInputRef} /></label>
          <label className="taste-check"><input type="checkbox" checked={spoiler} disabled={busy} onChange={event => { const nextSpoiler = event.target.checked; setSpoiler(nextSpoiler); drafts.current.set(commentDraftKey(parentId, editId), { body, spoiler: nextSpoiler }); setSendStatus(''); if (sendFailed) { setSendFailed(false); setSendError('') } }} />Contains spoilers</label>
          <div className="taste-actions">
            <button className="taste-button taste-button-primary" disabled={busy || !body.trim() || (editConflictRemoved && editingConflict)} onClick={() => {
              if (editId && editingConflict && !editConflictLatest) void loadLatestComment(editId)
              else void send()
            }} ref={sendButtonRef}>{busy ? editingConflict && !editConflictLatest ? 'Loading latest version…' : 'Saving…' : editingConflict && !editConflictLatest ? editConflictLoadError ? 'Retry loading latest version' : 'Load latest version' : editingConflict ? 'Save my draft over latest' : sendFailed ? editId ? 'Retry saving comment' : parentId ? 'Retry posting reply' : 'Retry posting comment' : editId ? 'Save comment' : parentId ? 'Post reply' : 'Post comment'}</button>
            {parentId || editId ? <button className="taste-button" disabled={busy} onClick={cancelComposer}>Cancel</button> : null}
          </div>
        </div>
      ) : !signedIn ? <Link className="taste-button" href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in to join in</Link> : null}
      {sendStatus ? <p className="taste-status" role="status">{sendStatus}</p> : null}
      {sendError ? <p role="alert" className="taste-status">{sendFailed ? `${sendError} Your draft is still here. Use ${editId ? 'Retry saving comment' : parentId ? 'Retry posting reply' : 'Retry posting comment'} to send the same request again.` : sendError}</p> : null}
      {editConflictLoadError && editingConflict ? <p role="alert" className="taste-status">{editConflictLoadError}</p> : null}
      {editConflictLatest && editingConflict ? <aside className="taste-status" aria-label="Latest saved version">
        <strong>Latest saved version</strong>
        <Spoiler hidden={editConflictLatest.spoiler}><p>{editConflictLatest.body}</p></Spoiler>
        <button className="taste-button" type="button" disabled={busy} onClick={() => {
          setBody(editConflictLatest.body)
          setSpoiler(editConflictLatest.spoiler)
          drafts.current.set(commentDraftKey(parentId, editId), { body: editConflictLatest.body, spoiler: editConflictLatest.spoiler })
          setSendStatus('Latest version copied into your draft.')
        }}>Use latest version</button>
      </aside> : null}
      {deleteStatus ? <p className="taste-status" role="status">{deleteStatus}</p> : null}
      {deletingComment ? (
        <TasteDialog
          className="taste-delete-dialog"
          dismissible={!busy}
          initialFocusRef={keepCommentRef}
          onClose={() => { setDeleteConfirmationId(null); setDeleteFailedId(null); setDeleteError('') }}
          title="Delete this comment?"
        >
          <p>This comment will be marked removed, and its text will no longer be shown.</p>
          {deleteError ? <p className="taste-status" role="alert">{deleteError} The comment is still here. Retry the same delete request.</p> : null}
          <div className="taste-actions">
            <button className="taste-button" disabled={busy} onClick={() => { setDeleteConfirmationId(null); setDeleteFailedId(null); setDeleteError('') }} ref={keepCommentRef}>Keep comment</button>
            <button className="taste-button taste-button-danger" disabled={busy} onClick={() => void remove(deletingComment.id)} ref={deleteFailedId === deletingComment.id ? deleteButtonRef : undefined}>
              {busy ? 'Deleting…' : deleteFailedId === deletingComment.id ? 'Retry deleting comment' : 'Delete comment'}
            </button>
          </div>
        </TasteDialog>
      ) : null}
    </section>
  )
}

export function SocialInbox() {
  const session = useSession()
  return session.member ? <SocialInboxContent key={session.member.id} /> : null
}
function SocialInboxContent() {
  const [data, setData] = useState<z.infer<typeof tasteNotificationsSchema> | null>(null)
  const [error, setError] = useState('')
  const [failedLoad, setFailedLoad] = useState<{ cursor?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [status, setStatus] = useState('')
  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    try {
      const result = await tasteRead(`notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, tasteNotificationsSchema, signal)
      if (!signal?.aborted) {
        setData(old => cursor && old ? { ...result, items: [...old.items, ...result.items] } : result)
        setError('')
        setFailedLoad(null)
      }
    } catch (e) {
      if (!signal?.aborted) {
        setError(errorText(e))
        setFailedLoad(cursor === undefined ? {} : { cursor })
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])
  // Network completion updates state asynchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const c = new AbortController(); void load(undefined, c.signal); return () => c.abort() }, [load])
  const unread = Boolean(data?.items.some(item => !item.read))
  async function markAllRead() {
    if (loading || markingAll || !unread) return
    setMarkingAll(true)
    setError('')
    setFailedLoad(null)
    setStatus('')
    try {
      await tasteWrite('notifications/read-all', {}, 'POST')
      setData(current => current ? { ...current, items: current.items.map(item => ({ ...item, read: true })) } : current)
      setStatus('All conversations are marked read.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setMarkingAll(false)
    }
  }
  return <section aria-busy={loading || markingAll} className="taste">
    <div className="taste-section-heading">
      <h2>Conversations &amp; curators</h2>
      <button className="taste-button" disabled={!unread || loading || markingAll} onClick={() => void markAllRead()} type="button">
        {markingAll ? 'Marking read…' : 'Mark all read'}
      </button>
    </div>
    {data?.items.map(item => <article className="taste-notice" key={item.id}>
      <div className="taste-social-notice">
        {item.href ? <Link href={item.href}>{!item.read ? <strong>{item.text}</strong> : item.text}</Link> : <p>{item.text}</p>}
        <time className="taste-muted" dateTime={item.createdAt}>{formatTasteDate(item.createdAt)}</time>
      </div>
    </article>)}
    {data && !data.items.length ? <p className="taste-empty">Replies and updates you subscribe to will appear here.</p> : null}
    {loading && !data ? <p role="status">Loading social notifications…</p> : null}
    {status ? <p className="taste-status" role="status">{status}</p> : null}
    {data?.nextCursor ? <button className="taste-button" disabled={loading} onClick={() => { setLoading(true); setStatus(''); void load(data.nextCursor!) }} type="button">{loading ? 'Loading updates…' : 'More updates'}</button> : null}
    {error ? <p role="alert">{error} <button className="taste-button" disabled={loading || markingAll} onClick={() => {
      if (markingAll) return
      if (data && !failedLoad) void markAllRead()
      else { setLoading(true); void load(failedLoad?.cursor) }
    }} type="button">{data && !failedLoad ? 'Retry marking all read' : failedLoad?.cursor ? 'Retry loading more updates' : 'Retry loading updates'}</button></p> : null}
  </section>
}

export function ModerationQueue() {
  type ModerationAction = 'dismiss' | 'remove' | 'restrict' | 'restore'
  const actions: Array<{ value: ModerationAction; label: string; success: string }> = [
    { value: 'dismiss', label: 'Dismiss report', success: 'Report dismissed and decision recorded.' },
    { value: 'remove', label: 'Remove content', success: 'Content removed and decision recorded.' },
    { value: 'restrict', label: 'Restrict publishing', success: 'Publishing restricted and decision recorded.' },
    { value: 'restore', label: 'Restore publishing', success: 'Publishing restored and decision recorded.' },
  ]
  const [data, setData] = useState<z.infer<typeof tasteReportsSchema> | null>(null)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<{ id: string; action: ModerationAction } | null>(null)
  const [failedAction, setFailedAction] = useState<{ id: string; action: ModerationAction } | null>(null)
  const [status, setStatus] = useState('')
  const statusRef = useRef<HTMLParagraphElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const load = useCallback(async () => {
    setError('')
    try { setData(await tasteRead('moderation', tasteReportsSchema)) }
    catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }, [])
  // Network completion updates state asynchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (status) statusRef.current?.focus() }, [status])
  useEffect(() => { if (failedAction) retryRef.current?.focus() }, [failedAction])
  async function act(id: string, action: ModerationAction) {
    const note = notes[id]?.trim() ?? ''
    if (note.length < 3 || working) return
    setWorking({ id, action }); setStatus('')
    if (!failedAction) setError('')
    try {
      await tasteWrite(`moderation/${id}`, { action, note }, 'POST')
      setStatus(actions.find(item => item.value === action)!.success)
      setError(''); setFailedAction(null)
      setNotes(current => { const next = { ...current }; delete next[id]; return next })
      await load()
    } catch (e) {
      setError(errorText(e))
      setFailedAction({ id, action })
    } finally { setWorking(null) }
  }
  return <div className="taste">
    <h1>Community reports</h1>
    {loading && !data && !error ? <p role="status">Loading reports…</p> : null}
    {status ? <p ref={statusRef} aria-live="polite" className="taste-status" role="status" tabIndex={-1}>{status}</p> : null}
    {data?.items.map(report => {
      const noteLength = notes[report.id]?.trim().length ?? 0
      return <article className="taste-comment" key={report.id}>
        <h3>{report.target.kind} report</h3>
        <p>{report.reason}</p>
        <details>
          <summary>Inspect reported content (may contain spoilers)</summary>
          <blockquote className="taste-review-body">{report.content}</blockquote>
          {report.href ? <Link href={report.href}>Open publication</Link> : null}
        </details>
        <p className="taste-muted"><time dateTime={report.createdAt}>{formatTasteDate(report.createdAt)}</time> · {report.target.id}</p>
        <label>Decision note<textarea value={notes[report.id] ?? ''} onChange={e => setNotes(current => ({ ...current, [report.id]: e.target.value }))} /></label>
        {noteLength < 3 ? <p className="taste-muted">Add a decision note of at least 3 characters to choose an action.</p> : null}
        <div className="taste-actions">{actions.map(action => <button className="taste-button" key={action.value} disabled={working !== null || noteLength < 3} onClick={() => void act(report.id, action.value)}>{working?.id === report.id && working.action === action.value ? 'Saving…' : action.label}</button>)}</div>
      </article>
    })}
    {data && !data.items.length ? <p className="taste-empty">No open reports.</p> : null}
    {error ? <div className="taste-status"><p role="alert">{error}</p><button ref={retryRef} className="taste-button" disabled={working !== null} onClick={() => failedAction ? void act(failedAction.id, failedAction.action) : void load()}>{failedAction ? 'Retry this decision' : 'Retry loading reports'}</button></div> : null}
  </div>
}
