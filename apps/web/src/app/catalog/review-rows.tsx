'use client'

import type { TitleReview } from '@consumit/contracts'
import { Heart, Star } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Avatar } from '@consumit/ui'

import { memberAvatarSrc } from '@/lib/avatar'
import { setReviewLiked } from '@/lib/identity-browser'

import { useSession } from '../session/session'

export const REVIEW_EXCERPT_LENGTH = 220

export function formatReviewedOn(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ReviewBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = body.length > REVIEW_EXCERPT_LENGTH
  const displayBody = isLong && !expanded ? `${body.slice(0, REVIEW_EXCERPT_LENGTH)}...` : body
  return (
    <p className="mt-2.5 font-serif text-[15px] leading-[1.7] text-[var(--fs-secondary)] break-words whitespace-pre-line sm:text-[16px]">
      {displayBody}
      {isLong ? (
        <button
          className="ml-1.5 font-sans text-xs font-bold text-[var(--fs-ink)] underline outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? 'show less' : 'more'}
        </button>
      ) : null}
    </p>
  )
}

function ReviewRow({ item, liked, likesCount, likeBusy, onToggleLike }: {
  item: TitleReview
  liked: boolean
  likesCount: number
  likeBusy: boolean
  onToggleLike: (() => void) | null
}) {
  const name = item.author.displayName || item.author.username
  return (
    <article className="border-b border-[var(--fs-line)] pb-6 last:border-b-0">
      <div className="flex items-start gap-3">
        <Link
          aria-label={`View profile of ${name}`}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
          href={`/profile/${item.author.username}`}
        >
          <Avatar
            className="size-10"
            name={name}
            size="md"
            src={memberAvatarSrc(item.author.avatarUrl, item.author.username)}
            treatment={item.author.avatarStyle}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <Link
              className="font-bold text-[var(--fs-ink)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
              href={`/profile/${item.author.username}`}
            >
              {name}
            </Link>
            {item.rating !== null ? (
              <span className="inline-flex items-center gap-1 font-bold text-[#ff5d38] tabular-nums">
                <Star aria-hidden="true" className="size-3.5 fill-current" />
                {item.rating}
                <span className="sr-only">out of 10</span>
              </span>
            ) : null}
          </div>
          {item.reviewedOn ? (
            <p className="mt-0.5 text-[11px] text-[var(--fs-muted)] tabular-nums">{formatReviewedOn(item.reviewedOn)}</p>
          ) : null}
          <ReviewBody body={item.body} />
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--fs-muted)]">
            {onToggleLike ? (
              <button
                aria-label={liked ? `Unlike this review by ${name}` : `Like this review by ${name}`}
                aria-pressed={liked}
                className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 -ml-2 font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-60 ${liked ? 'text-[#ff5d38]' : 'hover:text-[var(--fs-ink)]'}`}
                disabled={likeBusy}
                onClick={onToggleLike}
                type="button"
              >
                <Heart aria-hidden="true" className={`size-3.5 ${liked ? 'fill-current' : ''}`} />
                {likesCount > 0 ? <span className="tabular-nums">{likesCount} {likesCount === 1 ? 'like' : 'likes'}</span> : 'Like'}
              </button>
            ) : likesCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Heart aria-hidden="true" className="size-3.5" />
                {likesCount} {likesCount === 1 ? 'like' : 'likes'}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

/**
 * Interactive member-review rows shared by the title section and the
 * dedicated reviews page. Like state is optimistic per row and reverts with
 * an honest error when the write fails; counts reconcile on the next load.
 */
export function ReviewRows({ items }: { items: readonly TitleReview[] }) {
  const { member } = useSession()
  const [overrides, setOverrides] = useState<Record<string, { liked: boolean; likesCount: number }>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  async function toggleLike(item: TitleReview) {
    if (!member || busy[item.reviewId]) return
    const override = overrides[item.reviewId]
    const current = { liked: override?.liked ?? item.liked, likesCount: override?.likesCount ?? item.likesCount }
    const next = !current.liked
    setOverrides((prev) => ({ ...prev, [item.reviewId]: { liked: next, likesCount: current.likesCount + (next ? 1 : -1) } }))
    setBusy((prev) => ({ ...prev, [item.reviewId]: true }))
    setError(null)
    try {
      await setReviewLiked(item.reviewId, next)
    } catch {
      setOverrides((prev) => {
        const remaining = { ...prev }
        delete remaining[item.reviewId]
        return remaining
      })
      setError('Your like could not be saved. Please retry.')
    } finally {
      setBusy((prev) => {
        const remaining = { ...prev }
        delete remaining[item.reviewId]
        return remaining
      })
    }
  }

  return (
    <>
      <div className="space-y-6">
        {items.map((item) => {
          const override = overrides[item.reviewId]
          return (
            <ReviewRow
              key={item.reviewId}
              item={item}
              liked={override?.liked ?? item.liked}
              likesCount={override?.likesCount ?? item.likesCount}
              likeBusy={!!busy[item.reviewId]}
              onToggleLike={member && member.username !== item.author.username ? () => void toggleLike(item) : null}
            />
          )
        })}
      </div>
      {error ? <p className="mt-3 text-xs text-orange" role="alert">{error}</p> : null}
    </>
  )
}
