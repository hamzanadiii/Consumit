import type { MemberProfileData } from '@consumit/contracts'
import type { ReactNode } from 'react'
import { FilScreenShell } from '../shared'
import { ProfileArchiveHeader } from './profile-archive-header'
import { ProfileSectionNavigation, type ProfileSectionId } from './profile-section-navigation'

export function ProfileArchiveShell({ children, data, heading, owner = false, section }: {
  children: ReactNode
  data: MemberProfileData
  heading: string
  owner?: boolean
  section: ProfileSectionId
}) {
  return <FilScreenShell pageHeading={undefined}>
    <main className="mx-auto w-full max-w-[90rem] px-1 sm:px-3 lg:px-4" data-consumit-profile-archive>
      <ProfileArchiveHeader data={data} heading={heading} owner={owner} />
      <ProfileSectionNavigation active={section} counts={{ diary: data.statistics.diaryEntries, films: data.statistics.watched, lists: data.statistics.lists, reviews: data.statistics.reviews }} name={data.profile.displayName ?? data.profile.username} owner={owner} username={data.profile.username} />
      {children}
    </main>
  </FilScreenShell>
}
