import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultExperiencePreferences, type MemberProfile, type ExperiencePatch } from '@consumit/contracts'

import { SessionProvider } from '../session/session'

import { SettingsScreen } from './settings-screen'

const mocks = vi.hoisted(() => ({
  experienceRequest: vi.fn(),
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

vi.mock('@/lib/experience-browser', () => ({ experienceRequest: mocks.experienceRequest }))

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

beforeEach(() => {
  const preferences = { ...defaultExperiencePreferences(), subtitleLanguages: ['en', 'ar', 'fr'] }
  mocks.experienceRequest.mockImplementation(async (_signal: AbortSignal, patch?: ExperiencePatch) => ({ preferences: { ...preferences, ...patch }, saved: true }))
})
describe('profile publishing', () => {
  beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear() })
  function screenWithProfile() {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
  }
  it('starts private, explains the boundary and saves an explicit public choice', async () => {
    mocks.updateMemberProfile.mockResolvedValue({ ...profile, visibility: 'public' })
    screenWithProfile()
    expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked()
    expect(screen.getByText(/Publishing shares your display name/)).toHaveTextContent('all ratings, and all reviews')
    expect(screen.getByText(/Location, diary, watched titles/)).toHaveTextContent('stay private')
    await userEvent.click(screen.getByRole('radio', { name: 'Public' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' })))
    expect(await screen.findByText('Profile saved.')).toBeVisible()
  })
  it('retains the selected visibility after a failed save and permits a retry', async () => {
    mocks.updateMemberProfile.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...profile, visibility: 'public' })
    screenWithProfile()
    await userEvent.click(screen.getByRole('radio', { name: 'Public' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    expect(await screen.findByRole('alert', { name: 'Settings error' })).toHaveTextContent('profile could not be saved')
    expect(screen.getByRole('radio', { name: 'Public' })).toBeChecked()
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    expect(await screen.findByText('Profile saved.')).toBeVisible()
  })
})
