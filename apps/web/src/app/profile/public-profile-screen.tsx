import { titleHref, type CatalogRef, type CatalogTitleSummary, type MemberProfileData } from '@consumit/contracts'
import { Pencil } from 'lucide-react'
import Link from 'next/link'

import { Badge, ContentCard, CuratedListCard, DiaryRow, ProfileMasthead, SectionHeading, Tabs, buttonVariants } from '@consumit/ui'

import { FavoritesEditor } from './favorites-editor'
import { BannerEditor } from './banner-editor'
import { EditBannerButton, EditFavoritesButton, ProfileEditProvider } from './profile-edit'
import { ScreenShell } from '../screens/screen-shell'
import { SaveTitleButton } from '../catalog/save-title-button'

import { memberAvatarSrc } from '@/lib/avatar'

function refKey(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-card border border-dashed border-border bg-surface px-6 py-10 text-sm leading-6 text-muted">{children}</div>
}

export function ProfileScreen({ catalogUnavailable = false, data, owner = false, titles }: { catalogUnavailable?: boolean; data: MemberProfileData; owner?: boolean; titles: readonly CatalogTitleSummary[] }) {
  const titleMap = new Map(titles.map((title) => [refKey(title), title]))
  const name = data.profile.displayName ?? data.profile.username
  const favoriteTitles = data.favorites.map((favorite) => titleMap.get(refKey(favorite))).filter((title): title is CatalogTitleSummary => Boolean(title))
  return (
    <ScreenShell activeHref={`/profile/${data.profile.username}`}>
      <ProfileEditProvider>
      <main className="mx-auto min-h-screen w-full max-w-[90rem]" data-consumit-owner-profile={owner || undefined} data-consumit-public-profile={!owner || undefined}>
        <h1 className="sr-only">{owner ? 'Your profile' : `${name}'s public profile`}</h1>
        <ProfileMasthead actions={owner ? <span className="flex flex-wrap gap-3"><Link className={buttonVariants()} href="/settings"><Pencil aria-hidden="true" /> Edit profile</Link><EditBannerButton /></span> : undefined} avatarClassName="size-28 lg:size-36" avatarSrc={memberAvatarSrc(data.profile.avatarUrl, data.profile.username)} avatarTreatment={data.profile.avatarStyle} backgroundSrc={data.profile.bannerUrl ?? favoriteTitles.find((title) => title.backdropUrl)?.backdropUrl ?? favoriteTitles.find((title) => title.posterUrl)?.posterUrl ?? undefined} bio={data.profile.bio ?? undefined} className="rounded-none border-x-0 border-t-0 lg:min-h-[24.75rem] lg:px-[62px]" contentClassName="lg:inset-x-[62px]" joined={`Joined ${new Date(data.profile.createdAt).getUTCFullYear()}`} location={data.profile.location ?? undefined} name={name} stats={[{ label: 'watched', value: data.statistics.watched }, { label: 'diary', value: data.statistics.diaryEntries }, { label: 'reviews', value: data.statistics.reviews }, { label: 'lists', value: data.statistics.lists }]} username={`@${data.profile.username}`} />
        {owner ? <div className="px-5 sm:px-8 lg:px-[62px]"><BannerEditor currentBannerUrl={data.profile.bannerUrl} /></div> : null}
        <Tabs activeValue="overview" aria-label={`${name} profile sections`} className="bg-navigation px-5 sm:px-8 lg:px-[62px]" items={[{ href: '#overview', label: 'Overview', value: 'overview' }, { href: '#diary', label: 'Diary', value: 'diary' }, { href: '#favorites', label: 'Favorites', value: 'favorites' }, { href: '#reviews', label: 'Reviews', value: 'reviews' }, { href: '#lists', label: 'Lists', value: 'lists' }]} />
        <div className="px-5 sm:px-8 lg:px-[62px]" id="overview">
          {catalogUnavailable ? <p className="mt-8 rounded-control border border-border bg-surface p-4 text-xs text-muted">Your profile is available, but TMDB artwork and title details could not load.</p> : null}
          <section className="py-12 sm:py-14 lg:py-16" id="favorites" aria-labelledby="favorites-heading"><SectionHeading action={owner ? <EditFavoritesButton /> : undefined} description="Four ordered Favorites from your real library" id="favorites-heading" title="Favorites" />{data.favorites.length === 0 ? <div className="mt-8"><EmptyState>{owner ? 'No favorites yet. Use Edit favorites to pick up to four titles.' : 'This member has not picked favorites yet.'}</EmptyState></div> : <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4">{data.favorites.map((favorite) => { const title = titleMap.get(refKey(favorite)); const kindLabel = favorite.kind === 'movie' ? 'Movie' : 'Series'; return <ContentCard action={<SaveTitleButton id={favorite.id} kind={favorite.kind} title={title?.title ?? `${kindLabel} #${favorite.id}`} />} artworkSrc={title?.posterUrl ?? undefined} badge={<Badge tone="neutral">{kindLabel}</Badge>} href={titleHref(favorite)} key={refKey(favorite)} meta={title?.year ? String(title.year) : 'Catalog details unavailable'} title={title?.title ?? `${kindLabel} #${favorite.id}`} /> })}</div>}{owner ? <FavoritesEditor current={data.favorites} initialTitles={favoriteTitles} /> : null}</section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="diary" aria-labelledby="diary-heading"><SectionHeading id="diary-heading" title="Recent diary" /><div className="mt-6 max-w-5xl">{data.diary.length === 0 ? <EmptyState>No diary entries yet. Confirm a Letterboxd import to bring watched dates and rewatches here.</EmptyState> : data.diary.map((entry) => { const title = titleMap.get(refKey(entry)); return <DiaryRow artworkSrc={title?.posterUrl ?? undefined} date={new Date(`${entry.watchedOn}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} detail={entry.rewatch ? 'Rewatched' : 'Watched'} href={titleHref(entry)} key={entry.entryId} title={title?.title ?? `Movie #${entry.id}`} /> })}</div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="reviews" aria-labelledby="reviews-heading"><SectionHeading id="reviews-heading" title="Reviews" /><div className="mt-8 grid gap-5 lg:grid-cols-2">{data.reviews.length === 0 ? <div className="lg:col-span-2"><EmptyState>No reviews yet. Consumit will show only reviews this member actually wrote.</EmptyState></div> : data.reviews.map((review) => { const title = titleMap.get(refKey(review)); return <article className="rounded-card border border-border bg-surface p-6" key={review.reviewId}><Link className="font-display text-2xl text-ink hover:text-orange" href={titleHref(review)}>{title?.title ?? `Movie #${review.id}`}</Link>{review.reviewedOn ? <p className="mt-2 text-xs text-muted">Reviewed {new Date(`${review.reviewedOn}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p> : null}<p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-copy">{review.body}</p></article> })}</div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="lists" aria-labelledby="lists-heading"><SectionHeading id="lists-heading" title={`${name}'s lists`} /><div className="mt-8 grid gap-5 md:grid-cols-3">{data.lists.length === 0 ? <div className="md:col-span-3"><EmptyState>No lists yet. Imported lists remain private until this member publishes them.</EmptyState></div> : data.lists.map((list) => <CuratedListCard artworkSources={[]} curator={name} href={`/lists/${list.slug}`} key={list.id} meta={`${list.itemCount} titles`} title={list.name} />)}</div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16"><SectionHeading id="social-heading" title="Social" /><div className="mt-8"><EmptyState>Following and Circle activity are not available yet. Follower counts and online status are never fabricated.</EmptyState></div></section>
        </div>
      </main>
      </ProfileEditProvider>
    </ScreenShell>
  )
}
