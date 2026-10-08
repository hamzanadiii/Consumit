'use client'

import type { MemberReview, TitleReviewsPage } from '@consumit/contracts'
import { reviewsHref } from '@consumit/contracts'
import { PenLine, Plus } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Avatar } from '@consumit/next-ui'

import { memberAvatarSrc } from '@/lib/avatar'
import { getMemberTitleState, listTitleReviews } from '@/lib/identity-browser'

import { useSession } from '../session/session'
import { LogDialog } from './log-dialog'
import { formatReviewedOn, ReviewBody, ReviewRows } from './review-rows'

type TitleReviewsProps = {
  id: number
  kind: 'movie' | 'series' | 'anime'
  title: string
  posterUrl?: string | null | undefined
  year?: number | null | undefined
}

const RECENT_PREVIEW_COUNT = 3

/**
 * Member reviews for a title: the signed-in member's own stored review plus
 * recent reviews from members with public profiles.
 */
export function TitleReviews({ id, kind, title, posterUrl, year }: TitleReviewsProps) {
  const { member, status: sessionStatus } = useSession()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>(member ? 'loading' : 'idle')
  const [review, setReview] = useState<MemberReview | null>(null)
  const [logging, setLogging] = useState(false)
  const [recent, setRecent] = useState<TitleReviewsPage | null>(null)
  const [recentStatus, setRecentStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [showAllRecent, setShowAllRecent] = useState(false)
  const sort = 'recent' as const

  useEffect(() => {
    if (!member) return
    let cancelled = false
    void getMemberTitleState({ id, kind }).then(
      (state) => {
        if (cancelled) return
        setReview(state.review)
        setStatus(state.review ? 'ready' : 'empty')
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [member, id, kind])

  useEffect(() => {
    let cancelled = false
    void listTitleReviews({ id, kind }, 1, sort).then(
      (page) => {
        if (cancelled) return
        setRecent(page)
        setShowAllRecent(false)
        setRecentStatus('ready')
      },
      () => {
        if (!cancelled) setRecentStatus('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, kind, sort])

  async function reload() {
    setStatus('loading')
    try {
      const state = await getMemberTitleState({ id, kind })
      setReview(state.review)
      setStatus(state.review ? 'ready' : 'empty')
    } catch {
      setStatus('error')
    }
  }

  async function reloadRecent() {
    setRecentStatus('loading')
    try {
      const page = await listTitleReviews({ id, kind }, 1, sort)
      setRecent(page)
      setRecentStatus('ready')
    } catch {
      setRecentStatus('error')
    }
  }

  const avatarSrc = member ? memberAvatarSrc(member.avatarUrl, member.id) : null
  const displayName = member?.displayName || member?.username || 'You'
  const recentItems = recent?.items ?? []
  const visibleRecent = showAllRecent ? recentItems : recentItems.slice(0, RECENT_PREVIEW_COUNT)

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 border-b border-[var(--fs-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--fs-muted)]">
          {review ? 'Your review' : 'Member reviews'}
        </span>

        {member ? (
          <button
            className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 self-start rounded-lg border border-[var(--fs-line)] bg-[var(--fs-field)] px-3 py-1 text-xs font-bold text-[var(--fs-ink)] shadow-xs transition-colors outline-none hover:border-[var(--fs-accent)] hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            onClick={() => setLogging(true)}
            type="button"
          >
            {review ? <PenLine aria-hidden="true" className="size-3.5" /> : <Plus aria-hidden="true" className="size-3.5" />}
            {review ? 'Edit review' : 'Log or review'}
          </button>
        ) : null}
      </div>

      {sessionStatus === 'loading' ? (
        <p className="mt-6 text-sm text-[var(--fs-muted)]" role="status">Checking your account…</p>
      ) : !member ? (
        <div className="mt-6 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]">
            <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)]/40 underline-offset-4 outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/sign-in">Sign in</Link>
            {' '}to log {title} and write the first member review.
          </p>
        </div>
      ) : status === 'loading' || status === 'idle' ? (
        <p className="mt-6 text-sm text-[var(--fs-muted)]" role="status">Loading your review…</p>
      ) : status === 'error' ? (
        <div className="mt-6 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]" role="alert">Your review could not be loaded, but nothing was lost.</p>
          <button
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            onClick={() => void reload()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : !review ? (
        <div className="mt-6 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]">No member reviews yet. Share what stayed with you — your review will appear here.</p>
        </div>
      ) : (
        <article className="mt-6 rounded-xl border border-[var(--fs-line)] bg-[var(--fs-field)] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar
              className="size-10"
              name={displayName}
              size="md"
              src={avatarSrc ?? undefined}
              treatment={member.avatarStyle}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--fs-ink)]">{displayName}</p>
              {review.reviewedOn ? (
                <p className="mt-0.5 text-xs text-[var(--fs-muted)] tabular-nums">{formatReviewedOn(review.reviewedOn)}</p>
              ) : null}
            </div>
          </div>

          <ReviewBody body={review.body} />
        </article>
      )}

      {recentStatus === 'ready' ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--fs-muted)]">
              Recent reviews
              <span aria-hidden="true" className="ml-2 font-normal normal-case tabular-nums">{recent?.totalResults}</span>
              <span className="sr-only">, {recent?.totalResults} in total</span>
            </p>
          </div>
          {recentItems.length > 0 ? (
            <>
              <div className="mt-5">
                <ReviewRows key={sort} items={visibleRecent} />
              </div>
              {(recent?.totalResults ?? 0) > RECENT_PREVIEW_COUNT ? (
                <button
                  className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs font-bold text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                  onClick={() => setShowAllRecent((value) => !value)}
                  type="button"
                >
                  {showAllRecent ? 'Show fewer' : `Show all ${recent?.totalResults} reviews`}
                  <span aria-hidden="true">{showAllRecent ? '↑' : '↓'}</span>
                </button>
              ) : null}
              {showAllRecent && (recent?.totalPages ?? 0) > 1 ? (
                <p className="mt-1 text-xs text-[var(--fs-muted)] tabular-nums">Showing the 10 most recent of {recent?.totalResults}.</p>
              ) : null}
              {(recent?.totalPages ?? 0) > 1 ? (
                <Link
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                  href={reviewsHref({ id, kind })}
                >
                  Browse all {recent?.totalResults} reviews
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      ) : recentStatus === 'error' ? (
        <div className="mt-8 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]" role="alert">Recent reviews could not be loaded.</p>
          <button
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            onClick={() => void reloadRecent()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {logging && member ? (
        <LogDialog
          existingReview={review ? { body: review.body, reviewId: review.reviewId, reviewedOn: review.reviewedOn } : null}
          id={id}
          kind={kind}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false)
            void reload()
          }}
          posterUrl={posterUrl ?? undefined}
          title={title}
          year={year}
        />
      ) : null}
    </div>
  )
}
