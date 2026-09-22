import type { CatalogKind, TitleReviewAudience, TitleReviewSort } from '@consumit/contracts'
import { reviewsHref, titleHref } from '@consumit/contracts'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState, SectionHeading, Tabs } from '@consumit/ui'

import { CatalogApiError, getCatalogTitle } from '@/lib/catalog-api'
import { getTitleReviews, MemberApiError } from '@/lib/member-server'

import { FilScreenShell } from '../shared'
import { CatalogUnavailableScreen } from './catalog-ui'
import { ReviewRows } from './review-rows'

export type TitleReviewsPageProps = {
  audience: TitleReviewAudience
  id: number
  kind: CatalogKind
  page: number
  sort: TitleReviewSort
}

function pageHref(kind: CatalogKind, id: number, page: number, sort: TitleReviewSort, audience: TitleReviewAudience) {
  return `${reviewsHref({ id, kind })}?sort=${sort}&audience=${audience}&page=${page}`
}

function tabHref(kind: CatalogKind, id: number, sort: TitleReviewSort, audience: TitleReviewAudience) {
  return `${reviewsHref({ id, kind })}?sort=${sort}&audience=${audience}`
}

/**
 * Dedicated member-reviews archive for a title: every public-profile review,
 * newest or most-liked first, across server-rendered pages. Likes stay
 * interactive per row; authoring still lives on the title page.
 */
export async function TitleReviewsPage({ audience, id, kind, page, sort }: TitleReviewsPageProps) {
  let title
  try {
    const response = await getCatalogTitle(kind, id)
    title = response.item
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound()
    return <CatalogUnavailableScreen error={error} />
  }
  if (title.kind !== kind) notFound()

  let reviews
  try {
    reviews = await getTitleReviews(kind, id, page, sort, audience)
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    return (
      <FilScreenShell activeKindTab={kind === 'series' ? 'series' : 'movies'} pageHeading={`${title.title} reviews`}>
        <main className="mx-auto w-full max-w-[90rem]">
          <div className="px-1 sm:px-3 lg:px-4">
            <div className="mt-6 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
              <p className="text-sm leading-6 text-[var(--fs-secondary)]" role="alert">Member reviews could not be loaded, but nothing was lost.</p>
              <Link
                className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                href={pageHref(kind, id, page, sort, audience)}
              >
                Try again
              </Link>
            </div>
          </div>
        </main>
      </FilScreenShell>
    )
  }
  if (reviews.totalResults > 0 && page > reviews.totalPages) notFound()

  return (
    <FilScreenShell activeKindTab={kind === 'series' ? 'series' : 'movies'} pageHeading={`${title.title} reviews`}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-title-reviews>
        <div className="px-1 sm:px-3 lg:px-4">
          <Link
            className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            href={titleHref({ id, kind })}
          >
            <span aria-hidden="true">←</span> Back to {title.title}
          </Link>
          <div className="mt-2">
            <SectionHeading
              description={reviews.totalResults === 0
                ? 'No member reviews yet.'
                : `${reviews.totalResults} member ${reviews.totalResults === 1 ? 'review' : 'reviews'} from public profiles.`}
              id="title-reviews-heading"
              title={`${title.title} reviews`}
            />
          </div>
          {reviews.totalResults > 0 || audience === 'circle' ? (
            <>
              <div className="mt-6">
                <Tabs
                  activeValue={audience === 'circle' ? 'friends' : sort}
                  aria-label="Sort member reviews"
                  items={[
                    { href: tabHref(kind, id, 'recent', 'all'), label: 'Recent', value: 'recent' },
                    { href: tabHref(kind, id, 'popular', 'all'), label: 'Popular', value: 'popular' },
                    { href: tabHref(kind, id, 'recent', 'circle'), label: 'Friends', value: 'friends' },
                  ]}
                />
              </div>
              {reviews.items.length > 0 ? (
                <>
                  <div className="mt-8">
                    <ReviewRows key={`${sort}-${audience}-${reviews.page}`} items={reviews.items} />
                  </div>
                  {reviews.totalPages > 1 ? (
                    <nav aria-label="Review pages" className="mt-8 flex items-center gap-4">
                      {reviews.page > 1 ? (
                        <Link
                          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-accent)] hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                          href={pageHref(kind, id, reviews.page - 1, sort, audience)}
                        >
                          ← Previous
                        </Link>
                      ) : null}
                      <p className="text-xs text-[var(--fs-muted)] tabular-nums" role="status">
                        Page {reviews.page} of {reviews.totalPages}
                      </p>
                      {reviews.page < reviews.totalPages ? (
                        <Link
                          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-accent)] hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                          href={pageHref(kind, id, reviews.page + 1, sort, audience)}
                        >
                          Next →
                        </Link>
                      ) : null}
                    </nav>
                  ) : null}
                </>
              ) : (
                <div className="mt-8">
                  <EmptyState
                    description="Follow members whose taste you trust, and their reviews will appear here."
                    title="No circle reviews yet"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="mt-8">
              <EmptyState
                action={(
                  <Link
                    className="inline-flex min-h-11 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                    href={titleHref({ id, kind })}
                  >
                    Back to {title.title}
                  </Link>
                )}
                description="Share what stayed with you — the first member review is written from the title page."
                title="No member reviews yet"
              />
            </div>
          )}
        </div>
      </main>
    </FilScreenShell>
  )
}
