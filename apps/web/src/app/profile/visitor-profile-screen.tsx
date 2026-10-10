import type { CatalogTitleSummary, MemberProfileData, PublicProfile } from '@consumit/contracts'
import { Avatar, SectionHeading } from '@consumit/ui'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { memberAvatarSrc } from '@/lib/avatar'
import { FilScreenShell } from '../shared'
import { FavoritesShelf } from './favorites-shelf'
import { FollowButton } from './follow-button'
import { ProfileSectionNavigation, type ProfileSectionId } from './profile-section-navigation'
import { ShareProfile } from './share-profile'

export function VisitorProfileScreen({ data, titles = [], section = 'overview', owner = false, children }: { data: PublicProfile | MemberProfileData; titles?: readonly CatalogTitleSummary[]; section?: ProfileSectionId; owner?: boolean; children?: ReactNode }) {
  const profile = data.profile
  const name = profile.displayName ?? profile.username
  const root = `/profile/${profile.username}`
  const publicData = 'viewerIsOwner' in data ? data : null
  const bins = data.ratingDistribution ?? []
  const maximum = Math.max(1, ...bins.map(bin => bin.count))
  return <FilScreenShell pageHeading={undefined}><main className="mx-auto w-full max-w-[90rem] px-1 sm:px-3 lg:px-4" data-consumit-public-profile>
    <header className="relative isolate overflow-hidden rounded-card border border-white/10 bg-[#09090b] text-white">
      {profile.bannerUrl ? <Image alt="" className="object-cover" fill priority sizes="(max-width: 1280px) 100vw, 1400px" src={profile.bannerUrl} /> : null}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,9,11,.96),rgba(9,9,11,.72)_52%,rgba(9,9,11,.3))]" />
      <div className="relative flex min-h-[310px] flex-col justify-end gap-5 p-5 sm:min-h-[350px] sm:p-7 lg:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-5"><Avatar className="size-20 shrink-0 ring-2 ring-white/25 sm:size-24 lg:size-28" name={name} size="xl" src={memberAvatarSrc(profile.avatarUrl, profile.username)} treatment={profile.avatarStyle} /><div className="min-w-0"><h1 className="break-words font-display text-[clamp(2.4rem,5vw,4.5rem)] leading-[.94] tracking-[-.025em]">{name}</h1><p className="mt-3 text-xs text-white/75">@{profile.username}</p>{profile.bio ? <p className="mt-3 max-w-[62ch] whitespace-pre-wrap text-sm leading-6 text-white/85">{profile.bio}</p> : null}</div></div><div className="flex flex-wrap items-center gap-3">{publicData ? <FollowButton isFollowing={publicData.profile.isFollowing} memberId={publicData.profile.id} username={profile.username} /> : null}<ShareProfile username={profile.username} variant="inline" /></div></div>
        {publicData ? <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/75">{(['ratings', 'reviews', 'lists', 'followers', 'following'] as const).map(key => <Link className="inline-flex min-h-10 items-center gap-1.5 rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white" href={key === 'followers' || key === 'following' ? `${root}/network?view=${key}` : `${root}/${key}`} key={key}><strong className="tabular-nums text-white">{key === 'followers' || key === 'following' ? publicData.social[key] : publicData.statistics[key]}</strong>{key}</Link>)}</div> : null}
      </div>
    </header>
    <ProfileSectionNavigation active={section} counts={publicData ? publicData.statistics : {}} name={name} owner={owner} username={profile.username} />
    {section === 'overview' ? <div className="grid gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]"><section><SectionHeading title="Favorites" /><div className="mt-6"><FavoritesShelf favorites={data.favorites} owner={false} titles={titles} /></div></section><section><SectionHeading title="Ratings" /><div aria-label="Rating distribution" className="mt-6 flex h-24 items-end gap-2">{bins.map(bin => <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={bin.value}><span aria-label={`${bin.count} titles rated ${bin.value} out of 10`} className="w-full rounded-t bg-[var(--fs-secondary)]" role="img" style={{ height: `${Math.max(3, bin.count / maximum * 72)}px` }} /><span className="text-xs tabular-nums text-[var(--fs-muted)]">{bin.value}</span></div>)}</div><Link className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-[var(--fs-accent)] hover:underline" href={`${root}/ratings`}>See all ratings</Link></section></div> : <section className="py-10"><h2 className="mb-6 font-display text-3xl capitalize text-[var(--fs-ink)]">{section}</h2>{children}</section>}
  </main></FilScreenShell>
}
