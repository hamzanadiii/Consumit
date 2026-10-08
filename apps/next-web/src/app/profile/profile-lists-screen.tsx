import type { MemberProfileData } from '@consumit/contracts'
import { ListsCollection, type ListsCollectionProps } from '../lists/lists-collection'
import { ProfileArchiveShell } from './profile-archive-shell'

export function ProfileListsScreen({ data, ...collection }: ListsCollectionProps & { data: MemberProfileData }) {
  return <ProfileArchiveShell data={data} heading="Lists" owner section="lists">
    <ListsCollection {...collection} />
  </ProfileArchiveShell>
}
