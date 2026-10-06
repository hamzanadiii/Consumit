import { diaryEntryHref, kindLabel, titleHref, type CatalogRef, type CatalogTitleSummary, type MemberProfileData } from '@consumit/contracts'
import { ArrowUpRight, Bookmark, Eye, Pencil, Repeat2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { ArtworkFrame, Avatar, PosterStack, SectionHeading } from '@consumit/ui'

import { BannerEditor } from './banner-editor'
import { FavoritesShelf } from './favorites-shelf'
import { EditBannerButton, ProfileEditProvider } from './profile-edit'
import { ProfileSectionNavigation, type ProfileSectionId } from './profile-section-navigation'
import { FilScreenShell } from '../shared'
import { AdPlaceholder } from '../shared/ad-placeholder'
import { TitleCard } from '../shared/title-card'

import { memberAvatarSrc } from '@/lib/avatar'

function refKey(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

function formatDiaryDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function diaryEpisodeLabel(entry: MemberProfileData['diary'][number]) {
  if (entry.episode === undefined) return ''
  if (entry.kind === 'series') return `S${String(entry.season ?? 0).padStart(2, '0')} E${String(entry.episode).padStart(2, '0')}`
  return `Episode ${entry.episode}`
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-card border border-dashed border-[var(--fs-field-border)] px-6 py-8 text-sm leading-6 text-[var(--fs-muted)]">
      {children}
    </div>
  )
}

function HeroStat({ href, label, value }: { href?: string; label: string; value: number }) {
  const content = (
    <span className="inline-flex min-h-10 items-center gap-1.5 text-xs text-white/75">
      <span className="font-bold tabular-nums text-white">{value}</span>
      <span>{label}</span>
    </span>
  )
  if (!href) return <div role="listitem">{content}</div>
  return (
    <a
      className="rounded outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white"
      href={href}
      role="listitem"
    >
      {content}
    </a>
  )
}

type ActivityKind = 'watch' | 'review'

type ActivityItem = {
  date: string | null
  kind: ActivityKind
  key: string
  rewatch?: boolean
  episodeLabel?: string
  ref: CatalogRef & { episode?: number | undefined; season?: number | undefined }
}

/**
 * Recent member activity is built from stored diary and review records only.
 * Reviews without a date sort after dated entries.
 */
function buildActivity(data: MemberProfileData): ActivityItem[] {
  const items: ActivityItem[] = [
    ...data.diary.map((entry) => ({
      date: entry.watchedOn,
      kind: 'watch' as const,
      key: 'watch-' + entry.entryId,
      rewatch: entry.rewatch,
      episodeLabel: diaryEpisodeLabel(entry),
      ref: entry,
    })),
    ...data.reviews.map((review) => ({
      date: review.reviewedOn,
      kind: 'review' as const,
      key: 'review-' + review.reviewId,
      ref: review,
    })),
  ]
  return items.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })
}

function ActivityFeed({ items, titleMap }: {
  items: readonly ActivityItem[]
  titleMap: Map<string, CatalogTitleSummary>
}) {
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4" data-consumit-profile-activity>
      {items.map((item) => {
        const title = titleMap.get(refKey(item.ref))
        const label = title?.title ?? (kindLabel(item.ref.kind) + ' #' + item.ref.id)
        const action = item.kind === 'review' ? 'Reviewed' : item.rewatch ? 'Rewatched' : 'Watched'
        const destination = item.kind === 'watch' ? diaryEntryHref(item.ref) : titleHref(item.ref)
        const cardTitle = title ?? { id: item.ref.id, kind: item.ref.kind, title: label, year: null, posterUrl: null, tmdbRating: null }
        return (
          <TitleCard
            className="min-w-0"
            href={destination}
            key={item.key}
            meta={[title?.year, kindLabel(item.ref.kind)].filter(Boolean).join(' · ')}
            rating={null}
            signal={(
              <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[var(--fs-accent)]">
                    {item.kind === 'review' ? <Pencil aria-hidden="true" className="size-3.5 shrink-0" /> : item.rewatch ? <Repeat2 aria-hidden="true" className="size-3.5 shrink-0" /> : <Eye aria-hidden="true" className="size-3.5 shrink-0" />}
                    <span className="truncate">{action}</span>
                  </span>
                  {item.date ? (
                    <time className="shrink-0 text-[var(--fs-muted)]" dateTime={item.date}>
                      {formatDiaryDate(item.date)}
                    </time>
                  ) : null}
                  {item.episodeLabel ? <span className="truncate text-[var(--fs-muted)]">{item.episodeLabel}</span> : null}
              </div>
            )}
            title={cardTitle}
            titleHref={destination}
          />
        )
      })}
    </ol>
  )
}

function ProfileCollectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link className="inline-flex min-h-10 items-center gap-1 rounded-control text-xs text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={href}>
      {children}<ArrowUpRight aria-hidden="true" className="size-3.5" />
    </Link>
  )
}

function SavedTitlesPreview({ preview, titleMap, username }: {
  preview: { hasMore: boolean; items: CatalogRef[] } | { unavailable: true }
  titleMap: Map<string, CatalogTitleSummary>
  username: string
}) {
  return (
    <section aria-labelledby="profile-saved-heading" data-consumit-private-saved-preview>
      <SectionHeading action={<ProfileCollectionLink href={`/profile/${encodeURIComponent(username)}/watchlist`}>View all</ProfileCollectionLink>} id="profile-saved-heading" title="Watchlist" variant="compact" />
      {'unavailable' in preview ? (
        <p className="mt-4 text-xs leading-5 text-[var(--fs-muted)]" role="status">Your saved shelf is temporarily unavailable. Open your library to try again.</p>
      ) : preview.items.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-control border border-dashed border-[var(--fs-field-border)] px-3 py-4">
          <Bookmark aria-hidden="true" className="size-5 shrink-0 text-[var(--fs-muted)]" />
          <p className="text-xs leading-5 text-[var(--fs-muted)]">Keep a title for later and it will be waiting here.</p>
        </div>
      ) : (
        <>
          <PosterStack className="mt-5" linkComponent={Link} items={preview.items.slice(0, 5).map((ref) => {
              const title = titleMap.get(refKey(ref))
              const label = title?.title ?? `${kindLabel(ref.kind)} #${ref.id}`
              return { key: refKey(ref), href: titleHref(ref), label, src: title?.posterUrl ?? undefined }
            })} />
          <p className="mt-3 text-xs leading-5 text-[var(--fs-muted)]">Latest {Math.min(preview.items.length, 5)} saved title{preview.items.length === 1 ? '' : 's'}{preview.hasMore || preview.items.length > 5 ? ' · more in your Watchlist' : ''}</p>
        </>
      )}
    </section>
  )
}

function DiaryPreview({ data, titleMap }: {
  data: MemberProfileData
  titleMap: Map<string, CatalogTitleSummary>
}) {
  const entries = data.diary.slice(0, 5)
  return (
    <section aria-labelledby="profile-diary-preview-heading" data-consumit-diary-preview>
      <SectionHeading action={<ProfileCollectionLink href={`/profile/${encodeURIComponent(data.profile.username)}/diary`}>View all</ProfileCollectionLink>} id="profile-diary-preview-heading" title="Diary" variant="compact" />
      {entries.length === 0 ? (
        <p className="mt-4 rounded-control border border-dashed border-[var(--fs-field-border)] px-3 py-4 text-xs leading-5 text-[var(--fs-muted)]">Watched stories will find a place here once the diary begins.</p>
      ) : (
        <ol className="mt-4 space-y-1">
          {entries.map((entry) => {
            const title = titleMap.get(refKey(entry))
            const label = title?.title ?? `${kindLabel(entry.kind)} #${entry.id}`
            return (
              <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-t border-[var(--fs-line)] py-2.5 first:border-t-0 first:pt-0" key={entry.entryId}>
                <time className="pt-0.5 text-center text-xs font-bold tracking-wide text-[var(--fs-muted)] uppercase" dateTime={entry.watchedOn}>
                  {formatDiaryDate(entry.watchedOn)}
                </time>
                <div className="min-w-0">
                  <Link className="block truncate text-xs font-bold text-[var(--fs-ink)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={diaryEntryHref(entry)}>{label}</Link>
                  <p className="mt-1 truncate text-xs text-[var(--fs-muted)]">{[entry.rewatch ? 'Rewatched' : 'Watched', diaryEpisodeLabel(entry)].filter(Boolean).join(' · ')}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {entries.length < data.statistics.diaryEntries ? <p className="mt-2 text-xs text-[var(--fs-muted)]">Latest {entries.length} of {data.statistics.diaryEntries} diary entries</p> : null}
    </section>
  )
}

function RecentListPreview({ data, listPosters }: {
  data: MemberProfileData
  listPosters: Readonly<Record<string, readonly (string | undefined)[]>>
}) {
  const lists = data.lists.slice(0, 2)
  return (
    <section aria-labelledby="profile-lists-preview-heading" data-consumit-recent-lists-preview>
      <SectionHeading action={<ProfileCollectionLink href={`/profile/${encodeURIComponent(data.profile.username)}/lists`}>View all</ProfileCollectionLink>} id="profile-lists-preview-heading" title="Recent lists" variant="compact" />
      {lists.length === 0 ? (
        <p className="mt-4 rounded-control border border-dashed border-[var(--fs-field-border)] px-3 py-4 text-xs leading-5 text-[var(--fs-muted)]">No lists here yet. A good collection always starts with one title.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {lists.map((list) => {
            const posters = listPosters[list.slug] ?? []
            return (
              <li key={list.id}>
                <Link className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/lists/${list.slug}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-[var(--fs-ink)] transition-colors group-hover:text-[var(--fs-accent)]">{list.name}</span>
                    <span className="mt-1 block text-xs text-[var(--fs-muted)]">{list.itemCount} {list.itemCount === 1 ? 'title' : 'titles'}{list.visibility === 'private' ? ' · private' : ''}</span>
                  </span>
                  <PosterStack aria-hidden="true" className="w-28" items={posters.map((src, index) => ({ key: String(index), label: '', src }))} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {data.lists.length > lists.length ? <p className="mt-3 text-xs text-[var(--fs-muted)]">Latest {lists.length} of {data.statistics.lists} lists</p> : null}
    </section>
  )
}

function RatingBar({ count, owner, username, value, tallest }: { count: number; owner: boolean; username: string; value: number; tallest: number }) {
  const label = `${count} ${count === 1 ? 'title' : 'titles'} rated ${value} out of 10`
  const bar = <span aria-hidden="true" className={`block w-full rounded-t-[3px] transition-[height,background-color] duration-200 motion-reduce:transition-none ${owner && count > 0 ? 'bg-[var(--fs-secondary)] group-hover:bg-[var(--fs-accent)] group-focus-visible:bg-[var(--fs-accent)]' : 'bg-[var(--fs-hover)]'}`} style={{ height: count === 0 ? '3px' : Math.max(6, (count / tallest) * 72) + 'px' }} />
  if (owner && count > 0) {
    return <Link aria-label={`Show ${label}`} className="group flex h-full min-w-0 flex-1 items-end rounded-t-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}/films?rating=${value}`} title={label}>{bar}</Link>
  }
  return <span aria-label={label} className="flex h-full min-w-0 flex-1 items-end" role="img" title={label}>{bar}</span>
}

export function ProfileScreen({ catalogUnavailable = false, data, listPosters = {}, owner = false, savedPreview, titles }: { catalogUnavailable?: boolean; data: MemberProfileData; listPosters?: Readonly<Record<string, readonly (string | undefined)[]>>; owner?: boolean; savedPreview?: { hasMore: boolean; items: CatalogRef[] } | { unavailable: true }; titles: readonly CatalogTitleSummary[] }) {
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
  const ratingDistribution = data.ratingDistribution ?? []
  const ratingCount = ratingDistribution.reduce((total, rating) => total + rating.count, 0)
  const tallestRatingBar = Math.max(1, ...ratingDistribution.map((rating) => rating.count))
  const meta = [`@${data.profile.username}`, data.profile.location ?? null, `Joined ${new Date(data.profile.createdAt).getUTCFullYear()}`].filter(Boolean).join(' · ')
  const activity = buildActivity(data)
  const sectionCounts: Partial<Record<ProfileSectionId, number>> = {
    diary: data.statistics.diaryEntries,
    films: data.statistics.watched,
    lists: data.statistics.lists,
    reviews: data.statistics.reviews,
  }

  return (
    <FilScreenShell pageHeading={undefined}>
      <ProfileEditProvider>
        <main className="mx-auto w-full max-w-[90rem] px-1 sm:px-3 lg:px-4" data-consumit-owner-profile={owner || undefined} data-consumit-public-profile={!owner || undefined}>
          <header className="relative isolate overflow-hidden rounded-card border border-white/10 bg-[#09090b] text-white" data-consumit-profile-masthead>
            {backdropUrl ? (
              <Image alt="" className="object-cover" fill priority sizes="(max-width: 1280px) 100vw, 1400px" src={backdropUrl} />
            ) : (
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: 'radial-gradient(120% 90% at 78% 8%, var(--consumit-surface-raised) 0%, var(--consumit-surface) 34%, var(--consumit-nav) 66%, var(--consumit-canvas) 100%)' }}
              />
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,9,11,0.96)_0%,rgba(9,9,11,0.72)_52%,rgba(9,9,11,0.18)_100%)]" />
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(9,9,11,0.98)_0%,rgba(9,9,11,0.36)_46%,transparent_100%)]" />

            <div className="relative flex min-h-[310px] flex-col justify-end gap-5 p-5 sm:min-h-[350px] sm:p-7 lg:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
                  <Avatar
                    className="size-20 shrink-0 ring-2 ring-white/25 sm:size-24 lg:size-28 lg:text-2xl"
                    decorative={false}
                    imageAlt={name + ' avatar'}
                    name={name}
                    size="xl"
                    src={memberAvatarSrc(data.profile.avatarUrl, data.profile.username) ?? undefined}
                    treatment={data.profile.avatarStyle}
                  />
                  <div className="min-w-0">
                    <h1 className="font-display text-[clamp(2.4rem,5vw,4.5rem)] leading-[0.94] font-normal tracking-[-0.025em] text-white">{name}</h1>
                    <p className="mt-3 text-xs font-medium text-white/75">{meta}</p>
                    {data.profile.bio ? <p className="mt-3 max-w-[62ch] text-sm leading-6 text-white/85">{data.profile.bio}</p> : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:pb-1">
                  {owner ? (
                    <>
                      <Link
                        className="inline-flex min-h-11 items-center gap-2 rounded-control bg-[var(--fs-accent)] px-5 text-sm font-bold text-[var(--fs-on-accent)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black motion-reduce:transition-none"
                        href="/settings"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit profile
                      </Link>
                      <EditBannerButton />
                    </>
                  ) : null}
                </div>
              </div>

              <nav aria-label={name + ' profile statistics'} className="flex flex-wrap items-center gap-x-5 gap-y-0 border-t border-white/15 pt-3 sm:gap-x-7">
                <HeroStat href={'/profile/' + encodeURIComponent(data.profile.username) + '/films'} label="watched" value={data.statistics.watched} />
                <HeroStat href={'/profile/' + encodeURIComponent(data.profile.username) + '/diary'} label="diary" value={data.statistics.diaryEntries} />
                <HeroStat href={'/profile/' + encodeURIComponent(data.profile.username) + '/reviews'} label="reviews" value={data.statistics.reviews} />
                <HeroStat href={'/profile/' + encodeURIComponent(data.profile.username) + '/lists'} label="lists" value={data.statistics.lists} />
              </nav>
            </div>
          </header>

          {owner ? <BannerEditor currentBannerUrl={data.profile.bannerUrl} /> : null}

          <div className="mt-5 sm:mt-6">
            <ProfileSectionNavigation counts={sectionCounts} name={name} owner={owner} username={data.profile.username} />

            {catalogUnavailable ? (
              <p className="mt-5 border-y border-[var(--fs-line)] py-3 text-xs leading-5 text-[var(--fs-muted)]" role="status">
                The profile is here, but catalog artwork and title details could not load.
              </p>
            ) : null}

            <section className="py-7 sm:py-9" id="overview" aria-label="Profile overview">
              <div className="grid min-w-0 items-start gap-9 lg:grid-cols-[minmax(0,1.65fr)_minmax(17rem,0.78fr)] lg:gap-12 xl:gap-16">
                <div className="min-w-0 space-y-10 sm:space-y-12">
                  <section className="min-w-0 scroll-mt-8" id="favorites" aria-labelledby="favorites-heading">
                    <SectionHeading
                      description={owner ? 'Four frames for the stories you carry with you.' : 'Four stories that stay with ' + name + '.'}
                      id="favorites-heading"
                      title="Favorite titles"
                    />
                    {data.favorites.length === 0 && !owner ? (
                      <div className="mt-6"><EmptyState>No Favorite titles yet.</EmptyState></div>
                    ) : (
                      <FavoritesShelf favorites={data.favorites} key={data.favorites.map(refKey).join('|')} owner={owner} titles={titles} />
                    )}
                  </section>

                  <section className="min-w-0 scroll-mt-8" id="activity" aria-labelledby="activity-heading">
                    <SectionHeading
                      action={<ProfileCollectionLink href={'/profile/' + encodeURIComponent(data.profile.username) + '/activity'}>All activity</ProfileCollectionLink>}
                      id="activity-heading"
                      title="Recent activity"
                    />
                    {activity.length === 0 ? (
                      <div className="mt-5"><EmptyState>No watches or reviews yet. Your recent activity will appear here.</EmptyState></div>
                    ) : (
                      <>
                        <div className="mt-4"><ActivityFeed items={activity.slice(0, 4)} titleMap={titleMap} /></div>
                      </>
                    )}
                  </section>

                  {data.reviews.length > 0 ? (
                    <section className="min-w-0 border-t border-[var(--fs-line)] pt-6" aria-labelledby="recent-reviews-heading">
                      <SectionHeading
                        action={<ProfileCollectionLink href={'/profile/' + encodeURIComponent(data.profile.username) + '/reviews'}>Read all</ProfileCollectionLink>}
                        description="Notes left behind for stories that lingered."
                        id="recent-reviews-heading"
                        title="Recent reviews"
                      />
                      <ul className="mt-5 divide-y divide-[var(--fs-line)] border-y border-[var(--fs-line)]">
                        {data.reviews.slice(0, 2).map((review) => {
                          const title = titleMap.get(refKey(review))
                          const label = title?.title ?? (kindLabel(review.kind) + ' #' + review.id)
                          return (
                            <li className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-4 py-4 sm:grid-cols-[4rem_minmax(0,1fr)]" key={review.reviewId}>
                              <Link className="block rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={titleHref(review)}>
                                <ArtworkFrame alt={label + ' poster'} ratio="portrait" src={title?.posterUrl ?? undefined} />
                              </Link>
                              <article className="min-w-0">
                                <Link className="font-display text-xl leading-tight text-[var(--fs-ink)] outline-none hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={titleHref(review)}>{label}</Link>
                                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[var(--fs-secondary)]">{review.body}</p>
                              </article>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ) : null}
                </div>

                <aside aria-label={name + ' profile highlights'} className="min-w-0 space-y-7 lg:pt-1">
                  {owner ? <AdPlaceholder placement="profile" position="early" shape="rectangle" /> : null}
                  {owner && savedPreview ? <SavedTitlesPreview preview={savedPreview} titleMap={titleMap} username={data.profile.username} /> : null}
                  <DiaryPreview data={data} titleMap={titleMap} />
                  <RecentListPreview data={data} listPosters={listPosters} />

                  {favoriteGenres.length > 0 ? (
                    <section aria-labelledby="taste-portrait-heading">
                      <SectionHeading id="taste-portrait-heading" title="Taste from favorites" variant="compact" />
                      <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">
                        Genres across {favoriteTitles.length} selected {favoriteTitles.length === 1 ? 'title' : 'titles'}.
                      </p>
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {favoriteGenres.map(([genre, count]) => (
                          <li className="inline-flex min-h-9 items-center gap-2 rounded-control border border-[var(--fs-field-border)] px-3 text-xs font-bold text-[var(--fs-ink)]" key={genre}>
                            {genre}<span className="font-normal tabular-nums text-[var(--fs-muted)]">{count}/{favoriteTitles.length}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {ratingCount > 0 ? (
                    <section aria-labelledby="profile-ratings-heading">
                      <SectionHeading action={<span className="inline-block pt-2 text-xs tabular-nums text-[var(--fs-muted)]">{ratingCount}</span>} id="profile-ratings-heading" title="Ratings" variant="compact" />
                      <div aria-label={'Distribution of ' + ratingCount + ' ratings'} className="mt-5 flex h-20 items-end gap-1" role="group">
                        {ratingDistribution.map(({ count, value }) => (
                          <RatingBar key={value} count={count} owner={owner} username={data.profile.username} value={value} tallest={tallestRatingBar} />
                        ))}
                      </div>
                      <div aria-hidden="true" className="mt-2 flex justify-between text-xs font-bold tabular-nums text-[var(--fs-muted)]"><span>1</span><span>10</span></div>
                      <p className="mt-3 text-xs leading-5 text-[var(--fs-muted)]">{owner ? 'Select a bar to see titles at that rating. These ratings are only visible to you.' : 'Only grouped totals appear here. Individual title ratings stay private.'}</p>
                    </section>
                  ) : null}
                </aside>
              </div>
            </section>
          </div>
        </main>
      </ProfileEditProvider>
    </FilScreenShell>
  )
}
