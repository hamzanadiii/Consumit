import type { MemberProfileData, PublicProfile } from '@consumit/contracts'
import type { ReactNode } from 'react'
import { FilScreenShell } from '../shared'
import { ProfileArchiveHeader } from './profile-archive-header'
import { ProfileSectionNavigation, type ProfileSectionId } from './profile-section-navigation'

export function ProfileArchiveShell({ children, data, heading, owner = false, section }: {
  children: ReactNode
  data: MemberProfileData | PublicProfile
  heading: string
  owner?: boolean
  section: ProfileSectionId
}) {
  const statistics = data.statistics
  const ratings = 'ratings' in statistics ? statistics.ratings : data.ratingDistribution?.reduce((total, bin) => total + bin.count, 0)
  const counts = {
    lists: statistics.lists,
    reviews: statistics.reviews,
    ...('watched' in statistics
      ? { films: statistics.watched, diary: statistics.diaryEntries }
      : {}),
    ...(ratings === undefined ? {} : { ratings }),
  }
  return <FilScreenShell pageHeading={undefined}>
    <main className="mx-auto w-full max-w-[90rem] px-1 sm:px-3 lg:px-4" data-consumit-profile-archive>
      <ProfileArchiveHeader data={data} heading={heading} owner={owner} />
      <ProfileSectionNavigation active={section} counts={counts} name={data.profile.displayName ?? data.profile.username} owner={owner} username={data.profile.username} />
      {children}
    </main>
  </FilScreenShell>
}
