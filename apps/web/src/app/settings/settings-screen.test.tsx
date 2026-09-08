import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MemberProfile } from '@consumit/contracts'

import { SessionProvider } from '../session/session'

import { SettingsScreen } from './settings-screen'

const mocks = vi.hoisted(() => ({
  changeMemberPassword: vi.fn(),
  deleteMemberAccount: vi.fn(),
  downloadMemberExport: vi.fn(),
  logoutMember: vi.fn(),
  refresh: vi.fn(),
  updateMemberProfile: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }),
}))

vi.mock('@/lib/identity-browser', () => ({
  changeMemberPassword: mocks.changeMemberPassword,
  deleteMemberAccount: mocks.deleteMemberAccount,
  downloadMemberExport: mocks.downloadMemberExport,
  IdentityApiError: class IdentityApiError extends Error {},
  logoutMember: mocks.logoutMember,
  updateMemberProfile: mocks.updateMemberProfile,
}))

const member = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: 'Hamza',
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  username: 'hamzanadi',
} as const

const profile: MemberProfile = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: 'Hamza',
  location: null,
  nextUsernameChangeAt: null,
  username: 'hamzanadi',
  usernameChangedAt: null,
  visibility: 'private',
}

describe('settings avatar portrait picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateMemberProfile.mockImplementation(async (input: Record<string, unknown>) => ({ ...profile, ...input }))
  })

  it('randomizes a generated portrait and saves its address with the account form', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)

    await user.click(screen.getByRole('button', { name: 'Randomize' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: expect.stringMatching(/^https:\/\/api\.dicebear\.com\/7\.x\/notionists\/svg\?seed=.+/), username: 'hamzanadi' }),
    ))
    expect(mocks.refresh).toHaveBeenCalled()
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
  })

  it('clears back to the generated tile', async () => {
    const user = userEvent.setup()
    mocks.updateMemberProfile.mockImplementation(async (input: Record<string, unknown>) => ({ ...profile, ...input }))
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={{ ...profile, avatarUrl: 'https://api.dicebear.com/7.x/notionists/svg?seed=abc' }} /></SessionProvider>)

    await user.click(screen.getByRole('button', { name: 'Use generated tile' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: null }),
    ))
  })
})
