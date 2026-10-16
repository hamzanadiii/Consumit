'use client'

import type { TitleReview } from '@consumit/contracts'
import { Star } from 'lucide-react'
import { useState } from 'react'

import { Avatar } from '@consumit/ui'

import { memberAvatarSrc } from '@/lib/avatar'


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

/** Review text and ratings remain readable without social actions. */
export function ReviewRows({ items }: { items: readonly TitleReview[] }) {
  return <div className="space-y-6">{items.map((item) => {
    const name = item.author.displayName || item.author.username
    return <article className="border-b border-[var(--fs-line)] pb-6 last:border-b-0" key={item.reviewId}>
      <div className="flex items-start gap-3">
        <Avatar className="size-10" name={name} size="md" src={memberAvatarSrc(item.author)} treatment={item.author.avatarStyle} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-bold text-[var(--fs-ink)]">{name}</span>
            {item.rating !== null ? <span className="inline-flex items-center gap-1 font-bold text-orange tabular-nums"><Star aria-hidden="true" className="size-3.5 fill-current" />{item.rating}<span className="sr-only">out of 10</span></span> : null}
          </div>
          {item.reviewedOn ? <p className="mt-0.5 text-[11px] text-[var(--fs-muted)] tabular-nums">{formatReviewedOn(item.reviewedOn)}</p> : null}
          <ReviewBody body={item.body} />
        </div>
      </div>
    </article>
  })}</div>
}
