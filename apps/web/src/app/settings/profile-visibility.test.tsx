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
  nextUsernameChangeAt: null,
  sectionVisibility: { favorites: true, ratings: true, reviews: true, lists: true, network: true, likes: true, tags: true, watchlist: true, watched: true, diary: true, history: true, activity: true },
  username: 'hamzanadi',
  usernameChangedAt: null,
}

beforeEach(() => {
  const preferences = { ...defaultExperiencePreferences(), subtitleLanguages: ['en', 'ar', 'fr'] }
  mocks.experienceRequest.mockImplementation(async (_signal: AbortSignal, patch?: ExperiencePatch) => ({ preferences: { ...preferences, ...patch }, saved: true }))
})
describe('profile section privacy', () => {
  beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear() })
  function screenWithProfile() {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
  }
  it('keeps profile identity public and saves individual section visibility', async () => {
    mocks.updateMemberProfile.mockResolvedValue({ ...profile, sectionVisibility: { ...profile.sectionVisibility, ratings: false } })
    screenWithProfile()
    expect(screen.queryByRole('radio', { name: 'Private' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument()
    expect(screen.getByText(/Your profile identity is public/)).toBeInTheDocument()
    expect(screen.getByText(/Watched, Diary, completed History, and Activity are visible by default/)).toBeInTheDocument()
    expect(screen.getByText(/Active playback, resume progress, saved provider sources, and account details never appear on your profile/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Ratings' })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ratings' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith(expect.objectContaining({ sectionVisibility: { favorites: true, ratings: false, reviews: true, lists: true, network: true, likes: true, tags: true, watchlist: true, watched: true, diary: true, history: true, activity: true } })))
    expect(await screen.findByText('Profile saved.')).toBeVisible()
  })
  it('explains and saves the Reviews choice for public title feeds', async () => {
    mocks.updateMemberProfile.mockResolvedValue({ ...profile, sectionVisibility: { ...profile.sectionVisibility, reviews: false } })
    screenWithProfile()
    expect(screen.getByText(/Turning Reviews off also hides your reviews from public title review feeds\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Reviews' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith(expect.objectContaining({
      sectionVisibility: { ...profile.sectionVisibility, reviews: false },
    })))
    expect(await screen.findByText('Profile saved.')).toBeVisible()
  })
  it('retains a selected section setting after a failed save and permits a retry', async () => {
    mocks.updateMemberProfile.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...profile, sectionVisibility: { ...profile.sectionVisibility, ratings: false } })
    screenWithProfile()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ratings' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    expect(await screen.findByRole('alert', { name: 'Settings error' })).toHaveTextContent('profile could not be saved')
    expect(screen.getByRole('checkbox', { name: 'Ratings' })).not.toBeChecked()
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)
    expect(await screen.findByText('Profile saved.')).toBeVisible()
  })

  it('keeps anonymous viewing trends off until the member opts in separately', async () => {
    screenWithProfile()
    const toggle = await screen.findByRole('switch', { name: 'Share anonymous viewing trends' })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    await waitFor(() => expect(mocks.experienceRequest).toHaveBeenCalledWith(expect.any(AbortSignal), { shareViewingTrends: true }))
  })
})
