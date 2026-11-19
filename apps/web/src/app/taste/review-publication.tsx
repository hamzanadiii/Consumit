'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { z } from 'zod'
import { titleHref, tasteReviewSchema, type CatalogTitleSummary } from '@consumit/contracts'
import { FilScreenShell } from '../shared'
import { LogDialog } from '../catalog/log-dialog'
import { formatTasteDate, TastePoster, Spoiler, TasteDialog } from './primitives'
import { Discussion, PublicationActions } from './social'
import { PublicationShare } from './share'
import { tasteWrite, errorText } from './api'
import { useSession } from '../session/session'

export function ReviewPublication({ review, title }: { review: z.infer<typeof tasteReviewSchema>; title?: CatalogTitleSummary | undefined }) {
  const router = useRouter()
  const session = useSession()
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [liked, setLiked] = useState(review.liked)
  const [likes, setLikes] = useState(review.likes)
  const [pendingLike, setPendingLike] = useState<boolean | null>(null)
  const [likeError, setLikeError] = useState('')
  const [likeStatus, setLikeStatus] = useState('')
  const likeButtonRef = useRef<HTMLButtonElement>(null)
  const retryLikeRef = useRef<HTMLButtonElement>(null)
  const restoreLikeFocus = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (likeError) retryLikeRef.current?.focus()
  }, [likeError])

  useEffect(() => {
    if (!likeStatus || !restoreLikeFocus.current) return
    restoreLikeFocus.current = false
    likeButtonRef.current?.focus()
  }, [likeStatus])

  async function saveLike(nextLiked: boolean) {
    const retrying = pendingLike !== null
    restoreLikeFocus.current = retrying && document.activeElement === retryLikeRef.current
    setBusy(true)
    setLikeError('')
    setLikeStatus('')
    try {
      await tasteWrite(`reviews/${review.reviewId}/like`, { liked: nextLiked })
      setLikes(current => Math.max(0, current + (nextLiked === liked ? 0 : nextLiked ? 1 : -1)))
      setLiked(nextLiked)
      setPendingLike(null)
      setLikeStatus(nextLiked ? 'Review liked.' : 'Review like removed.')
    } catch {
      setPendingLike(nextLiked)
      setLikeError('We could not confirm your like. Retry the same choice below.')
    } finally {
      setBusy(false)
    }
  }

  function toggleLike() {
    void saveLike(pendingLike ?? !liked)
  }

  function deleteReview() {
    setBusy(true)
    setError('')
    void tasteWrite(`reviews/${review.reviewId}`, undefined, 'DELETE')
      .then(() => {
        router.push(`/profile/${review.author.username}/reviews`)
        router.refresh()
      })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false))
  }

  return (
    <FilScreenShell>
      <main id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-reading">
        <Link href={`/profile/${review.author.username}/reviews`}>← Reviews by {review.author.name}</Link>
        <header className="taste-review-header">
          <TastePoster small refValue={review} title={title} />
          <div>
            <h1><Link href={titleHref(review)}>{title?.title ?? 'A review'}</Link></h1>
            <p className="taste-muted">
              {review.season !== null ? `Season ${review.season} · ` : ''}
              {review.episode !== null ? `Episode ${review.episode} · ` : ''}
              <time dateTime={review.createdAt}>{formatTasteDate(review.createdAt)}</time>
            </p>
            <Link href={`/profile/${review.author.username}`}>By {review.author.name}</Link>
            {review.rating !== null ? <p style={{ color: 'var(--fs-accent-text, #ff5d38)' }}>{review.rating / 2} / 5 at publication</p> : null}
          </div>
        </header>
        <Spoiler hidden={review.spoiler} label={review.episode ? `Spoilers through episode ${review.episode}` : 'Contains spoilers'}>
          <article className="taste-review-body">{review.body}</article>
        </Spoiler>
        <div className="taste-actions" style={{ marginTop: 32 }}>
          {session.member ? (
            <button className="taste-button" aria-pressed={liked} disabled={busy || pendingLike !== null} onClick={toggleLike} ref={likeButtonRef}>
              {liked ? 'Liked' : 'Like'} · {likes}
            </button>
          ) : (
            <Link className="taste-button" href={`/sign-in?next=${encodeURIComponent(`/reviews/${review.reviewId}`)}`}>Sign in to like</Link>
          )}
          <PublicationShare kind="review" id={review.reviewId} />
          {review.owner ? (
            <>
              <button className="taste-button" disabled={busy} onClick={() => setEditing(true)}>Edit review</button>
              <button className="taste-button" disabled={busy} onClick={() => { setError(''); setDeleting(true) }}>Delete review</button>
            </>
          ) : (
            <PublicationActions target={{ kind: 'review', id: review.reviewId }} memberId={review.author.id} />
          )}
        </div>
        {likeError ? (
          <div className="taste-status" role="alert">
            <p>{likeError}</p>
            <button className="taste-button" disabled={busy} onClick={() => pendingLike !== null && void saveLike(pendingLike)} ref={retryLikeRef} type="button">
              {pendingLike ? 'Retry like' : 'Retry unlike'}
            </button>
          </div>
        ) : null}
        {likeStatus ? <p className="taste-status" role="status">{likeStatus}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <Discussion target={{ kind: 'review', id: review.reviewId }} />
        {deleting ? (
          <TasteDialog title="Delete this review?" onClose={() => setDeleting(false)}>
            <p>Your rating and diary entry will remain. This review and its discussion will become unavailable.</p>
            <div className="taste-actions">
              <button className="taste-button" disabled={busy} onClick={() => setDeleting(false)}>Keep review</button>
              <button className="taste-button" disabled={busy} onClick={deleteReview}>Delete review</button>
            </div>
            {error ? <p role="alert">{error}</p> : null}
          </TasteDialog>
        ) : null}
        {editing ? (
          <LogDialog
            mode="review"
            id={review.id}
            kind={review.kind}
            title={title?.title ?? 'this title'}
            existingReview={{ reviewId: review.reviewId, body: review.body, reviewedOn: null }}
            {...(review.season === null ? {} : { season: review.season })}
            {...(review.episode === null ? {} : { episode: review.episode })}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); router.refresh() }}
          />
        ) : null}
      </main>
    </FilScreenShell>
  )
}
