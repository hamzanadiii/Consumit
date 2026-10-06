import { randomUUID } from 'node:crypto'

import type { IdentityRepository, IdentityRecord } from './repository.ts'

function copy(record: IdentityRecord): IdentityRecord {
  return { ...record, profile: { ...record.profile } }
}

export function createMemoryIdentityRepository(): IdentityRepository & { count(): number } {
  const byId = new Map<string, IdentityRecord>()
  const byEmail = new Map<string, string>()
  const byUsername = new Map<string, string>()
  const aliases = new Map<string, string>()

  return {
    async bumpAuthVersion(memberId) {
      const member = byId.get(memberId)
      if (!member || member.status !== 'ACTIVE') return null
      member.authVersion += 1
      return copy(member)
    },
    async changePassword(memberId, passwordHash) {
      const member = byId.get(memberId)
      if (!member || member.status !== 'ACTIVE') return null
      member.authVersion += 1
      member.passwordHash = passwordHash
      return copy(member)
    },
    count: () => [...byId.values()].filter((member) => member.status === 'ACTIVE').length,
    async createVerifiedAccount(input) {
      const existingId = byEmail.get(input.email)
      if (existingId && byId.get(existingId)?.status === 'ACTIVE') throw new Error('IDENTITY_EMAIL_CONFLICT')
      if (byUsername.has(input.username) || aliases.has(input.username)) throw new Error('IDENTITY_USERNAME_CONFLICT')
      const now = input.createdAt
      const record: IdentityRecord = {
        authVersion: 1,
        createdAt: now,
        email: input.email,
        emailVerifiedAt: now,
        id: randomUUID(),
        passwordHash: input.passwordHash,
        profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, displayName: null, location: null, username: input.username, usernameChangedAt: now, visibility: 'private' },
        role: 'MEMBER',
        status: 'ACTIVE',
      }
      byId.set(record.id, record)
      byEmail.set(record.email, record.id)
      byUsername.set(record.profile.username, record.id)
      return copy(record)
    },
    async exportMember(memberId, exportedAt) {
      const member = byId.get(memberId)
      if (!member || member.status !== 'ACTIVE') return null
      return {
        exportedAt: exportedAt.toISOString(),
        imports: [],
        library: { diary: [], favorites: [], lists: [], saved: [], watched: [] },
        watchHistory: [],
        member: {
          avatarStyle: member.profile.avatarStyle,
          avatarUrl: member.profile.avatarUrl,
          createdAt: member.createdAt.toISOString(),
          displayName: member.profile.displayName,
          email: member.email,
          emailVerified: member.emailVerifiedAt !== null,
          id: member.id,
          role: member.role === 'ADMIN' ? 'admin' : 'member',
          username: member.profile.username,
        },
        profile: {
          avatarStyle: member.profile.avatarStyle,
          avatarUrl: member.profile.avatarUrl,
          bannerUrl: member.profile.bannerUrl,
          bio: member.profile.bio,
          displayName: member.profile.displayName,
          location: member.profile.location,
          username: member.profile.username,
          usernameChangedAt: member.profile.usernameChangedAt?.toISOString() ?? null,
          visibility: member.profile.visibility,
        },
        ratings: [],
        reviews: [],
      }
    },
    async findByEmail(email) {
      const id = byEmail.get(email)
      const member = id ? byId.get(id) : undefined
      return member ? copy(member) : null
    },
    async findById(memberId) {
      const member = byId.get(memberId)
      return member ? copy(member) : null
    },
    async findByUsername(username) {
      const canonicalId = byUsername.get(username)
      const aliasId = aliases.get(username)
      const member = byId.get(canonicalId ?? aliasId ?? '')
      return member && member.status === 'ACTIVE'
        ? { canonical: canonicalId === member.id, record: copy(member) }
        : null
    },
    async isUsernameAvailable(username) {
      return !byUsername.has(username) && !aliases.has(username)
    },
    async listAll(limit = 50, offset = 0) {
      const active = [...byId.values()].filter((m) => m.status === 'ACTIVE')
      return { members: active.slice(offset, offset + limit).map(copy), total: active.length }
    },
    async setRole(memberId, role) {
      const member = byId.get(memberId)
      if (!member || member.status !== 'ACTIVE') return null
      member.role = role
      return copy(member)
    },
    async tombstone(memberId) {
      const member = byId.get(memberId)
      if (!member || member.status !== 'ACTIVE') return
      byEmail.delete(member.email)
      byUsername.delete(member.profile.username)
      aliases.set(member.profile.username, member.id)
      member.email = `deleted+${member.id}@invalid.consumit`
      member.emailVerifiedAt = null
      member.authVersion += 1
      member.passwordHash = null
        member.profile = { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, displayName: null, location: null, username: `deleted_${member.id}`, usernameChangedAt: null, visibility: 'private' }
      member.status = 'DELETED'
    },
    async updateProfile(memberId, input, changedAt) {
      const member = byId.get(memberId)
      if (!member || member.status !== 'ACTIVE') return null
      if (input.username && input.username !== member.profile.username) {
        if (byUsername.has(input.username) || aliases.has(input.username)) throw new Error('IDENTITY_USERNAME_CONFLICT')
        const previous = member.profile.username
        byUsername.delete(previous)
        aliases.set(previous, member.id)
        byUsername.set(input.username, member.id)
        member.profile.username = input.username
        member.profile.usernameChangedAt = changedAt
      }
      if (input.avatarStyle !== undefined) member.profile.avatarStyle = input.avatarStyle
      if (input.avatarUrl !== undefined) member.profile.avatarUrl = input.avatarUrl
      if (input.bannerUrl !== undefined) member.profile.bannerUrl = input.bannerUrl
      if (input.bio !== undefined) member.profile.bio = input.bio
      if (input.displayName !== undefined) member.profile.displayName = input.displayName
      if (input.location !== undefined) member.profile.location = input.location
      if (input.visibility !== undefined) member.profile.visibility = input.visibility
      return copy(member)
    },
  }
}
