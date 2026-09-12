'use client'

import { Heart, X } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { RatingInput } from '@consumit/ui'

import {
  clearMemberRating,
  createDiaryEntry,
  createMemberReview,
  getMemberLike,
  getMemberRating,
  IdentityApiError,
  setMemberLiked,
  setMemberRating,
  setMemberWatched,
} from '@/lib/identity-browser'

type LogDialogProps = {
  id: number
  kind: 'movie' | 'series'
  onClose: () => void
  onSaved: () => void
  posterUrl?: string | undefined
  title: string
  year?: number | null | undefined
}

const today = () => new Date().toISOString().slice(0, 10)

function parseTags(raw: string) {
  return raw
    .split(',')
    .map((tag) => tag.trim().slice(0, 100))
    .filter((tag) => tag.length > 0)
    .slice(0, 50)
}

/**
 * Native watch log in the Letterboxd diary shape: poster and title, watched
 * date plus rewatch flag, review, tags, rating, and like, committed with one
 * Save. Every section writes a real stored record; retrying never duplicates
 * a section that already landed.
 */
export function LogDialog({ id, kind, onClose, onSaved, posterUrl, title, year }: LogDialogProps) {
  const [date, setDate] = useState(today())
  const [logWatch, setLogWatch] = useState(true)
  const [rewatch, setRewatch] = useState(false)
  const [review, setReview] = useState('')
  const [tags, setTags] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [liked, setLiked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initial = useRef<{ liked: boolean; rating: number | null } | null>(null)
  const done = useRef({ diary: false, liked: false, rating: false, review: false, watched: false })
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getMemberRating({ id, kind }).then(
        (record) => record.value,
        (cause: unknown) => {
          if (cause instanceof IdentityApiError && cause.status === 404) return null
          throw cause
        },
      ),
      getMemberLike({ id, kind }).then(
        () => true,
        (cause: unknown) => {
          if (cause instanceof IdentityApiError && cause.status === 404) return false
          throw cause
        },
      ),
    ])
      .then(([storedRating, storedLiked]) => {
        if (cancelled) return
        initial.current = { liked: storedLiked, rating: storedRating }
        setRating(storedRating)
        setLiked(storedLiked)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          initial.current = { liked: false, rating: null }
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id, kind])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button, textarea, input, select, [href]')]
        .filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    if (!date) {
      setError('Choose a watched date.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (logWatch && !done.current.watched) {
        await setMemberWatched({ id, kind }, true)
        done.current.watched = true
      }
      if (logWatch && !done.current.diary) {
        await createDiaryEntry({ id, kind, rewatch, tags: parseTags(tags), watchedOn: date })
        done.current.diary = true
      }
      if (!done.current.rating) {
        if (rating === null) {
          if (initial.current?.rating !== null && initial.current?.rating !== undefined) {
            await clearMemberRating({ id, kind })
          }
        } else {
          await setMemberRating({ id, kind }, rating)
        }
        done.current.rating = true
      }
      if (!done.current.liked && initial.current && liked !== initial.current.liked) {
        await setMemberLiked({ id, kind }, liked)
        done.current.liked = true
      }
      const text = review.trim()
      if (!done.current.review && text) {
        await createMemberReview({ body: text, id, kind, reviewedOn: date })
        done.current.review = true
      }
      onSaved()
    } catch {
      setError('Your log could not be saved. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-canvas/80 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        aria-labelledby="log-dialog-heading"
        aria-modal="true"
        className="w-full max-w-2xl rounded-card border border-border bg-surface p-6 sm:p-8"
        ref={panelRef}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-3xl text-ink" id="log-dialog-heading">
            {`Log ${title}${year ? ` ${year}` : ''}`}
          </h2>
          <button
            aria-label="Close log dialog"
            className="grid size-11 shrink-0 place-items-center rounded-control text-copy outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <div aria-hidden="true" className="relative hidden aspect-[2/3] w-full overflow-hidden rounded-card border border-border bg-surface-raised sm:block">
            {posterUrl ? <Image alt="" className="object-cover" fill sizes="144px" src={posterUrl} /> : null}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
                <input
                  checked={logWatch}
                  className="size-4 cursor-pointer accent-orange"
                  disabled={busy}
                  onChange={(event) => setLogWatch(event.currentTarget.checked)}
                  type="checkbox"
                />
                Watched on
              </label>
              <input
                aria-label="Watched date"
                className="h-11 rounded-control border border-control-outline bg-field px-3 text-sm text-ink outline-none focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange"
                disabled={busy}
                onChange={(event) => setDate(event.currentTarget.value)}
                type="date"
                value={date}
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-copy">
                <input
                  checked={rewatch}
                  className="size-4 cursor-pointer accent-orange"
                  disabled={busy}
                  onChange={(event) => setRewatch(event.currentTarget.checked)}
                  type="checkbox"
                />
                I&rsquo;ve watched this before
              </label>
            </div>
            <label className="mt-5 block text-xs font-bold uppercase tracking-[0.12em] text-copy" htmlFor="log-dialog-review">
              Review
            </label>
            <textarea
              className="mt-2 min-h-32 w-full rounded-control border border-control-outline bg-field px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange"
              disabled={busy}
              id="log-dialog-review"
              maxLength={10_000}
              onChange={(event) => setReview(event.currentTarget.value)}
              placeholder="Add a review..."
              value={review}
            />
            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <div>
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-copy" htmlFor="log-dialog-tags">
                  Tags
                </label>
                <input
                  className="mt-2 h-11 w-full rounded-control border border-control-outline bg-field px-3 text-sm text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange"
                  disabled={busy}
                  id="log-dialog-tags"
                  onChange={(event) => setTags(event.currentTarget.value)}
                  placeholder="eg. cinema"
                  value={tags}
                />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-copy" id="log-dialog-rating-label">
                  Rating{rating === null ? '' : ` · ${rating} out of 10`}
                </p>
                <div className="mt-2">
                  <RatingInput label={`Rate ${title} out of 10`} name={`log-rating-${kind}-${id}`} onChange={setRating} value={rating} />
                </div>
              </div>
              <button
                aria-label={liked ? `Unlike ${title}` : `Like ${title}`}
                aria-pressed={liked}
                className="grid size-11 place-items-center self-end rounded-control text-copy outline-none transition-colors hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none"
                disabled={busy}
                onClick={() => setLiked((current) => !current)}
                type="button"
              >
                <Heart aria-hidden="true" className={liked ? 'size-6 fill-orange text-orange' : 'size-6'} />
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="mt-5 text-xs text-orange" role="alert">{error}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
          <button
            className="inline-flex min-h-11 items-center rounded-control bg-orange px-5 text-sm font-bold text-canvas outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-45 motion-reduce:transition-none"
            disabled={busy || loading}
            onClick={() => void save()}
            type="button"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            className="inline-flex min-h-11 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-copy outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
