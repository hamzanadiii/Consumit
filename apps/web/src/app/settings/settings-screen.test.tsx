import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
describe('settings preferred subtitle languages', () => {
  beforeEach(() => { localStorage.clear() })
  function renderSettings() { render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>) }
  it('keeps priority edits until an explicit save and restores focus after removing a language', async () => {
    const user = userEvent.setup()
    renderSettings()
    const group = await screen.findByRole('group', { name: 'Preferred subtitle languages' })
    await user.click(within(group).getByRole('button', { name: 'Remove Français' }))
    expect(within(group).getByRole('button', { name: 'Remove العربية' })).toHaveFocus()
    await user.click(within(group).getByRole('button', { name: /Add subtitle language/ }))
    await user.click(screen.getByRole('option', { name: 'Español' }))
    expect(screen.getByText(/Three languages selected/)).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: /Add subtitle language/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Español' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Save viewing preferences' }))
    await waitFor(() => expect(mocks.experienceRequest).toHaveBeenCalledWith(expect.any(AbortSignal), expect.objectContaining({ subtitleLanguages: ['en', 'ar', 'es'] })))
  })
  it('reorders the account languages and updates the semantic preference on save', async () => {
    const user = userEvent.setup()
    renderSettings()
    await user.click(await screen.findByRole('button', { name: 'Move العربية up' }))
    expect(within(screen.getByRole('list', { name: 'Subtitle language priority' })).getAllByRole('listitem')[0]).toHaveTextContent('العربية')
    expect(screen.getByRole('button', { name: 'Move العربية up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove العربية' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Save viewing preferences' }))
    await waitFor(() => expect(mocks.experienceRequest).toHaveBeenCalledWith(expect.any(AbortSignal), expect.objectContaining({ subtitleLanguages: ['ar', 'en', 'fr'] })))
  })
})
describe('settings honest playback surface', () => {
  it('highlights the section being read and lets Account return to its own section', async () => {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
    const rail = screen.getByRole('navigation', { name: 'Settings' })
    const sections = document.querySelectorAll('[data-consumit-settings-section]')
    sections.forEach((section, index) => vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, (index - 2) * 500 + 60, 800, 450)))
    fireEvent.scroll(window)
    await waitFor(() => expect(within(rail).getByRole('link', { name: /Streaming & playback/ })).toHaveAttribute('aria-current'))
    expect(within(rail).getByRole('link', { name: /Account/ })).not.toHaveAttribute('aria-current')
    expect(within(rail).getByRole('link', { name: /Account/ })).toHaveAttribute('href', '#account')
  })
  it('states automatic recovery and player-owned tracks as facts without dead controls', () => {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)

    expect(screen.getByText('Automatic source recovery.')).toBeInTheDocument()
    expect(screen.getByText(/switches to the next working source without losing your position/)).toBeInTheDocument()
    expect(screen.getByText('Adjust a title in Watch.')).toBeInTheDocument()
    expect(screen.queryByText('Not available')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit preferences' })).not.toBeInTheDocument()
    expect(screen.queryByText('Autoplay next episode')).not.toBeInTheDocument()
    expect(screen.queryByText('Playback quality')).not.toBeInTheDocument()
    expect(screen.queryByText('Hide spoilers')).not.toBeInTheDocument()
  })

  it('numbers the rail and the section headings in the same order', () => {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)

    const rail = screen.getByRole('navigation', { name: 'Settings' })
    expect(within(rail).getByRole('link', { name: /Account/ })).toHaveTextContent('01')
    expect(within(rail).getByRole('link', { name: /Data & security/ })).toHaveTextContent('06')
    expect(screen.getByRole('heading', { name: 'Privacy & social' })).toHaveTextContent('02')
    expect(screen.getByRole('heading', { name: 'Data & security' })).toHaveTextContent('06')
  })
})

describe('settings unsaved changes bar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateMemberProfile.mockImplementation(async (input: Record<string, unknown>) => ({ ...profile, ...input }))
  })

  it('appears when the profile form changes, discards, and saves from the bar', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)

    expect(screen.queryByText('You have unsaved changes to your profile.')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Display name'), '!')
    expect(screen.getByText('You have unsaved changes to your profile.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('You have unsaved changes to your profile.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('Hamza')

    await user.type(screen.getByLabelText('Display name'), '!')
    await user.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Hamza!' })))
    expect(screen.queryByText('You have unsaved changes to your profile.')).not.toBeInTheDocument()
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
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
