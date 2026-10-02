import { render, screen, waitFor, within } from '@testing-library/react'
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
  role: 'member',
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

describe('settings preferred subtitle languages', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  function renderSettings() {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
  }

  it('picks up to three languages in priority order and persists them', async () => {
    const user = userEvent.setup()
    renderSettings()
    const group = screen.getByRole('group', { name: 'Preferred subtitle languages' })

    await user.click(within(group).getByRole('button', { name: /العربية/ }))
    await user.click(within(group).getByRole('button', { name: /Français/ }))
    await user.click(within(group).getByRole('button', { name: /Español/ }))
    expect(JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]')).toEqual(['ar', 'fr', 'es'])
    expect(screen.getByText('3/3 · subtitles are fetched in these languages first, in order.')).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /Deutsch/ })).toBeDisabled()

    await user.click(within(group).getByRole('button', { name: /Français/ }))
    expect(JSON.parse(window.localStorage.getItem('consumit.player.subtitle-languages') ?? '[]')).toEqual(['ar', 'es'])
    expect(within(group).getByRole('button', { name: /Deutsch/ })).toBeEnabled()
  }, 15_000)
})

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
