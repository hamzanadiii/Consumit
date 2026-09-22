import { titleHref, type CatalogRef, type CatalogTitleSummary, type MemberProfileData } from '@consumit/contracts'
import { Pencil } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { ArtworkFrame, Avatar, CuratedListCard, DiaryRow, SectionHeading, Tabs } from '@consumit/ui'

import { BannerEditor } from './banner-editor'
import { FollowButton } from './follow-button'
import { FavoritesShelf } from './favorites-shelf'
import { EditBannerButton, ProfileEditProvider } from './profile-edit'
import { FilScreenShell } from '../shared'

import { memberAvatarSrc } from '@/lib/avatar'

function refKey(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

function formatDiaryDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function formatReviewDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] px-6 py-10 text-sm leading-6 text-[var(--fs-muted)]">
      {children}
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[4.5rem] flex-col gap-1">
      <dd className="order-1 text-xl font-bold tabular-nums text-white">{value}</dd>
      <dt className="order-2 text-[11px] font-bold tracking-[0.12em] text-white/60 uppercase">{label}</dt>
    </div>
  )
}

export function ProfileScreen({ catalogUnavailable = false, data, owner = false, titles }: { catalogUnavailable?: boolean; data: MemberProfileData; owner?: boolean; titles: readonly CatalogTitleSummary[] }) {
  const titleMap = new Map(titles.map((title) => [refKey(title), title]))
  const name = data.profile.displayName ?? data.profile.username
  const favoriteTitles = data.favorites.map((favorite) => titleMap.get(refKey(favorite))).filter((title): title is CatalogTitleSummary => Boolean(title))
  const backdropUrl = data.profile.bannerUrl
    ?? favoriteTitles.find((title) => title.backdropUrl)?.backdropUrl
    ?? favoriteTitles.find((title) => title.posterUrl)?.posterUrl
    ?? undefined
  const genreCounts = new Map<string, number>()
  for (const title of favoriteTitles) for (const genre of title.genreNames) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
  const favoriteGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  const meta = [`@${data.profile.username}`, data.profile.location ?? null, `Joined ${new Date(data.profile.createdAt).getUTCFullYear()}`].filter(Boolean).join(' · ')

  return (
    <FilScreenShell pageHeading={undefined}>
      <ProfileEditProvider>
        <main className="mx-auto w-full max-w-[90rem]" data-consumit-owner-profile={owner || undefined} data-consumit-public-profile={!owner || undefined}>
          <h1 className="sr-only">{owner ? 'Your profile' : `${name}'s public profile`}</h1>

          {/* Cinematic identity hero — FilScreen title-hero language, Letterboxd member facts. */}
          <header
            className="relative isolate overflow-hidden rounded-2xl border border-[var(--fs-line)] bg-[#0b0b0e] text-white shadow-2xl"
            data-consumit-title-masthead
          >
            {backdropUrl ? (
              <Image
                alt=""
                className="object-cover"
                fill
                priority
                sizes="(max-width: 1280px) 100vw, 1400px"
                src={backdropUrl}
              />
            ) : (
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: 'radial-gradient(120% 90% at 78% 8%, #f7b267 0%, #d97b3f 28%, #7a3a22 55%, #2a1a12 100%)' }}
              />
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94)_0%,rgba(0,0,0,0.72)_50%,rgba(0,0,0,0.18)_100%)]" />
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(11,11,14,0.98)_0%,rgba(11,11,14,0.4)_40%,transparent_100%)]" />

            <div className="relative flex min-h-[420px] flex-col justify-end gap-8 p-6 sm:p-10 lg:p-12">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end">
                  <Avatar
                    className="size-24 shrink-0 ring-2 ring-white/25 lg:size-32 lg:text-2xl"
                    decorative={false}
                    imageAlt={`${name} avatar`}
                    name={name}
                    size="xl"
                    src={memberAvatarSrc(data.profile.avatarUrl, data.profile.username) ?? undefined}
                    treatment={data.profile.avatarStyle}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-[0.18em] text-white/60 uppercase">{owner ? 'Your cinema' : 'Member profile'}</p>
                    <p className="mt-2 font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[0.95] font-normal tracking-[-0.025em] text-white">
                      {name}
                    </p>
                    <p className="mt-3 text-xs font-bold text-white/70">{meta}</p>
                    {data.profile.bio ? (
                      <p className="mt-4 max-w-[62ch] text-sm leading-6 text-white/85">{data.profile.bio}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {owner ? (
                    <>
                      <Link
                        className="inline-flex min-h-11 items-center gap-2 rounded-control bg-[#f4f0e8] px-5 text-sm font-bold text-[#09090b] shadow-md transition-all hover:bg-white active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
                        href="/settings"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit profile
                      </Link>
                      <EditBannerButton />
                    </>
                  ) : (
                    <FollowButton username={data.profile.username} />
                  )}
                </div>
              </div>

              <dl className="flex flex-wrap gap-x-8 gap-y-4 border-t border-white/15 pt-6">
                <HeroStat label="watched" value={data.statistics.watched} />
                <HeroStat label="diary" value={data.statistics.diaryEntries} />
                <HeroStat label="reviews" value={data.statistics.reviews} />
                <HeroStat label="lists" value={data.statistics.lists} />
                <HeroStat label="followers" value={data.social.followers} />
                <HeroStat label="following" value={data.social.following} />
              </dl>
            </div>
          </header>

          {owner ? <BannerEditor currentBannerUrl={data.profile.bannerUrl} /> : null}

          <div className="mt-8 px-1 sm:px-3 lg:px-4">
            <Tabs
              activeValue="overview"
              aria-label={`${name} profile sections`}
              items={[
                { href: '#overview', label: 'Overview', value: 'overview' },
                { href: '#favorites', label: 'Favorites', value: 'favorites' },
                { href: '#diary', label: 'Diary', value: 'diary' },
                { href: '#reviews', label: 'Reviews', value: 'reviews' },
                { href: '#lists', label: 'Lists', value: 'lists' },
              ]}
            />

            {catalogUnavailable ? (
              <p className="mt-6 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4 text-xs leading-5 text-[var(--fs-muted)]" role="status">
                Your profile is available, but TMDB artwork and title details could not load.
              </p>
            ) : null}

            {/* Letterboxd posters-only shelf in FilScreen language: bare frames
                that lift with an orange edge on hover, title and year revealed
                inside a legibility gradient. Owners see empty frames that open
                the editor. */}
            <section className="py-10 sm:py-12 lg:py-14" id="overview" aria-labelledby="favorites-heading">
              <div id="favorites" className="scroll-mt-6">
                <SectionHeading
                  description={owner ? 'Your six defining favorites.' : `The stories that stay with ${name}.`}
                  id="favorites-heading"
                  title="Favorites"
                />
                {data.favorites.length === 0 && !owner ? (
                  <div className="mt-8">
                    <EmptyState>This member has not picked favorites yet.</EmptyState>
                  </div>
                ) : (
                  <FavoritesShelf
                    favorites={data.favorites}
                    key={data.favorites.map(refKey).join('|')}
                    owner={owner}
                    titles={titles}
                  />
                )}
              </div>

              {favoriteGenres.length > 0 ? (
                <div className="mt-8 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-5 sm:p-6" aria-labelledby="taste-portrait-heading">
                  <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]" id="taste-portrait-heading">In the favorites</h2>
                  <p className="mt-1 text-xs text-[var(--fs-muted)]">Genres across {favoriteTitles.length} selected {favoriteTitles.length === 1 ? 'title' : 'titles'}.</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {favoriteGenres.map(([genre, count]) => (
                      <li
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-4 text-xs font-bold text-[var(--fs-ink)]"
                        key={genre}
                      >
                        {genre}
                        <span className="font-normal text-[var(--fs-muted)] tabular-nums">{count} of {favoriteTitles.length}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="diary" aria-labelledby="diary-heading">
              <SectionHeading id="diary-heading" title="Recent diary" />
              <div className="mt-6 max-w-5xl">
                {data.diary.length === 0 ? (
                  <EmptyState>No diary entries yet. Log a watch to keep its date here.</EmptyState>
                ) : (
                  data.diary.map((entry) => {
                    const title = titleMap.get(refKey(entry))
                    return (
                      <DiaryRow
                        artworkSrc={title?.posterUrl ?? undefined}
                        date={formatDiaryDate(entry.watchedOn)}
                        detail={entry.rewatch ? 'Rewatched' : 'Watched'}
                        href={titleHref(entry)}
                        key={entry.entryId}
                        title={title?.title ?? `Movie #${entry.id}`}
                      />
                    )
                  })
                )}
              </div>
            </section>

            <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="reviews" aria-labelledby="reviews-heading">
              <SectionHeading id="reviews-heading" title="Reviews" />
              {data.reviews.length === 0 ? (
                <div className="mt-8 max-w-5xl"><EmptyState>No reviews published yet.</EmptyState></div>
              ) : (
                <div className="mt-8 grid gap-4 xl:grid-cols-2">
                  {data.reviews.map((review) => {
                    const title = titleMap.get(refKey(review))
                    const label = title?.title ?? `Movie #${review.id}`
                    return (
                      <article
                        className="group grid min-w-0 grid-cols-[96px_minmax(0,1fr)] overflow-hidden rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] transition-all duration-200 hover:-translate-y-1 hover:border-[var(--fs-accent)]/50 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] motion-reduce:transition-none motion-reduce:transform-none sm:grid-cols-[128px_minmax(0,1fr)]"
                        key={review.reviewId}
                      >
                        <ArtworkFrame
                          alt={`${label} poster`}
                          className="h-full rounded-none border-0"
                          ratio="portrait"
                          src={title?.posterUrl ?? undefined}
                        />
                        <div className="min-w-0 p-4 sm:p-5">
                          <Link
                            className="font-display text-xl leading-tight text-[var(--fs-ink)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:text-2xl"
                            href={titleHref(review)}
                          >
                            {label}
                          </Link>
                          {review.reviewedOn ? (
                            <p className="mt-1.5 text-xs text-[var(--fs-muted)]">Reviewed {formatReviewDate(review.reviewedOn)}</p>
                          ) : null}
                          <p className="mt-3 line-clamp-6 text-sm leading-6 whitespace-pre-wrap text-[var(--fs-secondary)]">
                            {review.body}
                          </p>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="lists" aria-labelledby="lists-heading">
              <SectionHeading id="lists-heading" title={`${name}'s lists`} />
              {data.lists.length === 0 ? (
                <div className="mt-8"><EmptyState>No lists yet. Imported lists remain private until this member publishes them.</EmptyState></div>
              ) : (
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.lists.map((list) => (
                    <CuratedListCard
                      artworkSources={[]}
                      curator={name}
                      href={`/lists/${list.slug}`}
                      key={list.id}
                      meta={`${list.itemCount} titles`}
                      title={list.name}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </ProfileEditProvider>
    </FilScreenShell>
  )
}
