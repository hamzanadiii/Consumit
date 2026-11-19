import type { AvatarStyle, MemberExport, ProfileSectionVisibility, UpdateProfileRequest } from '@consumit/contracts'

export type IdentityRecord = {
  authVersion: number
  createdAt: Date
  email: string
  emailVerifiedAt: Date | null
  googleSubject?: string | null
  id: string
  passwordHash: string | null
  profile: {
    avatarStyle: AvatarStyle
    avatarUrl: string | null
    bannerUrl: string | null
    bio: string | null
    displayName: string | null
    sectionVisibility: ProfileSectionVisibility
    username: string
    usernameChangedAt: Date | null
  }
  role: 'MEMBER' | 'ADMIN'
  status: 'ACTIVE' | 'DELETED'
}

export interface IdentityRepository {
  bumpAuthVersion(memberId: string): Promise<IdentityRecord | null>
  changePassword(memberId: string, passwordHash: string): Promise<IdentityRecord | null>
  createVerifiedAccount(input: { createdAt: Date; displayName?: string | null; email: string; googleSubject?: string; passwordHash: string | null; username: string }): Promise<IdentityRecord>
  exportMember(memberId: string, exportedAt: Date): Promise<MemberExport | null>
  findByEmail(email: string): Promise<IdentityRecord | null>
  findByGoogleSubject(googleSubject: string): Promise<IdentityRecord | null>
  findById(memberId: string): Promise<IdentityRecord | null>
  findByUsername(username: string): Promise<{ canonical: boolean; record: IdentityRecord } | null>
  isUsernameAvailable(username: string): Promise<boolean>
  listAll(limit?: number, offset?: number): Promise<{ members: IdentityRecord[]; total: number }>
  linkGoogleSubject(memberId: string, googleSubject: string): Promise<IdentityRecord | null>
  setRole(memberId: string, role: 'MEMBER' | 'ADMIN'): Promise<IdentityRecord | null>
  tombstone(memberId: string): Promise<void>
  updateProfile(memberId: string, input: UpdateProfileRequest, changedAt: Date): Promise<IdentityRecord | null>
}
