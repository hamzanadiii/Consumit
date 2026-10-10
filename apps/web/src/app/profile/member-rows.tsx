import type { PublicMemberSummary } from '@consumit/contracts'
import { Avatar } from '@consumit/ui'
import Link from 'next/link'
import { memberAvatarSrc } from '@/lib/avatar'
import { FollowButton } from './follow-button'

export function MemberRows({ items, canUnfollowPrivate = false }: { items: readonly (PublicMemberSummary | { id: string; private: true })[]; canUnfollowPrivate?: boolean }) {
  return <ul className="divide-y divide-[var(--fs-line)]">{items.map(member => <li className="flex flex-wrap items-center gap-4 py-5 sm:gap-5" key={member.id}>{!('username' in member) ? <><Avatar name="Private member" size="md" treatment="noir" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[var(--fs-ink)]">Private member</p><p className="mt-1 text-xs text-[var(--fs-muted)]">This profile is unavailable.</p></div>{canUnfollowPrivate ? <FollowButton isFollowing memberId={member.id} privateMember /> : null}</> : <><Avatar name={member.displayName ?? member.username} size="md" src={memberAvatarSrc(member.avatarUrl, member.id)} treatment={member.avatarStyle} /><Link className="min-w-0 flex-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${member.username}`}><span className="block break-words text-base font-bold text-[var(--fs-ink)]">{member.displayName ?? member.username}</span><span className="mt-1 block text-sm text-[var(--fs-muted)]">@{member.username}</span></Link><FollowButton isFollowing={member.isFollowing} memberId={member.id} username={member.username} /></>}</li>)}</ul>
}
