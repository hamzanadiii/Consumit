import type { AvatarStyle, MemberExport, UpdateProfileRequest } from '@consumit/contracts'

export type IdentityRecord = {
  authVersion: number
  createdAt: Date
  email: string
  emailVerifiedAt: Date | null
  id: string
  passwordHash: string | null
  profile: {
    avatarStyle: AvatarStyle
    avatarUrl: string | null
    bannerUrl: string | null
    bio: string | null
    displayName: string | null
    location: string | null
    username: string
    usernameChangedAt: Date | null
    visibility: 'private' | 'public'
  }
  role: 'MEMBER' | 'ADMIN'
  status: 'ACTIVE' | 'DELETED'
}

export interface IdentityRepository {
  bumpAuthVersion(memberId: string): Promise<IdentityRecord | null>
  changePassword(memberId: string, passwordHash: string): Promise<IdentityRecord | null>
  createVerifiedAccount(input: { createdAt: Date; email: string; passwordHash: string; username: string }): Promise<IdentityRecord>
  exportMember(memberId: string, exportedAt: Date): Promise<MemberExport | null>
  findByEmail(email: string): Promise<IdentityRecord | null>
  findById(memberId: string): Promise<IdentityRecord | null>
  findByUsername(username: string): Promise<{ canonical: boolean; record: IdentityRecord } | null>
  isUsernameAvailable(username: string): Promise<boolean>
  listAll(limit?: number, offset?: number): Promise<{ members: IdentityRecord[]; total: number }>
  setRole(memberId: string, role: 'MEMBER' | 'ADMIN'): Promise<IdentityRecord | null>
  tombstone(memberId: string): Promise<void>
  updateProfile(memberId: string, input: UpdateProfileRequest, changedAt: Date): Promise<IdentityRecord | null>
}
