import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import type { MemberProfileData } from '@consumit/contracts'
import { Avatar, buttonVariants } from '@consumit/ui'

import { memberAvatarSrc } from '@/lib/avatar'

export function ProfileArchiveHeader({ data, heading, owner }: {
  data: MemberProfileData
  heading: string
  owner: boolean
}) {
  const name = data.profile.displayName ?? data.profile.username
  const username = data.profile.username

  return (
    <header className="relative py-6" data-consumit-archive-header>
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link aria-label={`${name}'s profile`} className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}`}>
            <Avatar className="size-14 ring-1 ring-[var(--fs-line)]" decorative imageAlt="" name={name} size="lg" src={memberAvatarSrc(data.profile.avatarUrl, username) ?? undefined} treatment={data.profile.avatarStyle} />
          </Link>
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(2rem,3vw,3rem)] leading-none tracking-[-0.025em] text-[var(--fs-ink)]" id="profile-archive-heading">{heading}</h1>
            <p className="mt-2 truncate text-xs text-[var(--fs-muted)]"><Link className="text-[var(--fs-secondary)] outline-none hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}`}>{name}</Link> <span>· @{username}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {owner ? <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href="/settings">Edit profile</Link> : null}
          <Link aria-label={`Back to ${name}'s profile`} className="grid size-10 place-items-center rounded-control text-[var(--fs-muted)] outline-none hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}`}><ArrowLeft aria-hidden="true" className="size-4" /></Link>
        </div>
      </div>
    </header>
  )
}
