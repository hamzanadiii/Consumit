import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultExperiencePreferences, type MemberProfile, type ExperiencePatch } from '@consumit/contracts'

import { IdentityApiError } from '@/lib/identity-browser'

import { SessionProvider } from '../session/session'

import { SettingsScreen } from './settings-screen'

const mocks = vi.hoisted(() => ({
  experienceRequest: vi.fn(),
  changeMemberPassword: vi.fn(),
  deleteMemberAccount: vi.fn(),
  downloadMemberExport: vi.fn(),
  logoutMember: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  updateMemberProfile: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
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

  it('keeps rail destinations and Settings sections in the same order', () => {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)

    const rail = screen.getByRole('navigation', { name: 'Settings' })
    const links = within(rail).getAllByRole('link')
    const sections = [...document.querySelectorAll<HTMLElement>('[data-consumit-settings-section]')]

    expect(links.map(link => link.textContent?.trim())).toEqual(sections.map(section => section.querySelector('h2')?.textContent?.trim()))
    expect(links.map(link => link.getAttribute('href'))).toEqual(sections.map(section => `#${section.id}`))
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

describe('settings account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.experienceRequest.mockResolvedValue({ preferences: defaultExperiencePreferences(), saved: true })
  })

  function renderSettings() {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
  }

  it('explains what deletion removes and requires an explicit acknowledgement', async () => {
    const user = userEvent.setup()
    renderSettings()
    await user.click(screen.getByRole('button', { name: /^Delete account$/ }))

    expect(screen.getByText(/permanently closes your account/i)).toBeInTheDocument()
    expect(screen.getByText(/profile, reviews, ratings, saved titles, lists, Watch History, and playback progress/i)).toBeInTheDocument()
    expect(screen.getByText(/username stays reserved/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Request export$/ })).toBeInTheDocument()
    expect(screen.getByLabelText(/I understand this permanently deletes my account data/i)).toBeRequired()
    expect(screen.getByLabelText('Confirm your password')).toBeRequired()
    expect(screen.getByRole('button', { name: /^Delete my account permanently$/ })).toBeDisabled()
  })

  it('locks the deletion form while pending and signs out after success', async () => {
    let finishDelete!: () => void
    mocks.deleteMemberAccount.mockImplementation(() => new Promise<void>(resolve => { finishDelete = resolve }))
    const user = userEvent.setup()
    renderSettings()
    await user.click(screen.getByRole('button', { name: /^Delete account$/ }))
    await user.type(screen.getByLabelText('Confirm your password'), 'experience-fixture-password')
    await user.click(screen.getByLabelText(/I understand this permanently deletes my account data/i))
    await user.click(screen.getByRole('button', { name: /^Delete my account permanently$/ }))

    const form = screen.getByRole('form', { name: 'Delete account confirmation' })
    expect(form).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Confirm your password')).toBeDisabled()
    expect(screen.getByLabelText(/I understand this permanently deletes my account data/i)).toBeDisabled()
    expect(within(form).getByRole('status')).toHaveTextContent('Deleting your account…')
    expect(screen.getByRole('button', { name: /^Delete my account permanently$/ })).toBeDisabled()
    expect(mocks.deleteMemberAccount).toHaveBeenCalledWith('experience-fixture-password')

    finishDelete()
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'))
    expect(mocks.refresh).toHaveBeenCalled()
  })
})

describe('settings password change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.experienceRequest.mockResolvedValue({ preferences: defaultExperiencePreferences(), saved: true })
  })

  function renderSettings() {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
  }

  it('locks credentials while pending, retains them after failure, and confirms a successful retry', async () => {
    let rejectChange!: (error: Error) => void
    mocks.changeMemberPassword
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectChange = reject }))
      .mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderSettings()
    await user.click(screen.getByRole('button', { name: /^Change password$/ }))

    const currentPassword = screen.getByLabelText('Current password')
    const newPassword = screen.getByLabelText('New password')
    expect(newPassword).toHaveAttribute('maxLength', '128')
    await user.type(currentPassword, 'current-password')
    await user.type(newPassword, 'replacement-password')
    await user.click(screen.getByRole('button', { name: /^Update password$/ }))

    const form = screen.getByRole('form', { name: 'Change password' })
    expect(form).toHaveAttribute('aria-busy', 'true')
    expect(currentPassword).toBeDisabled()
    expect(newPassword).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Updating password…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Sign out$/ })).toBeDisabled()
    rejectChange(new IdentityApiError('The current password is incorrect.', { code: 'INVALID_CREDENTIALS', retryable: false, status: 401 }))

    const error = await within(form).findByRole('alert', {})
    expect(error).toHaveTextContent('The current password is incorrect.')
    expect(error).toHaveFocus()
    expect(currentPassword).toHaveValue('current-password')
    expect(newPassword).toHaveValue('replacement-password')
    expect(currentPassword).toBeEnabled()
    expect(newPassword).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Sign out$/ })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /^Update password$/ }))
    await waitFor(() => expect(mocks.changeMemberPassword).toHaveBeenNthCalledWith(2, {
      currentPassword: 'current-password',
      newPassword: 'replacement-password',
    }))
    expect(await screen.findByText('Password updated.', { exact: true })).toBeVisible()
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
  })
})

describe('settings data export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.experienceRequest.mockResolvedValue({ preferences: defaultExperiencePreferences(), saved: true })
  })

  function renderSettings() {
    render(<SessionProvider initialMember={{ ...member }} initialStatus="authenticated"><SettingsScreen initialProfile={profile} /></SessionProvider>)
  }

  it('locks account actions while preparing an export and focuses a recoverable failure before confirming a retry', async () => {
    let rejectExport!: (error: Error) => void
    let finishExport!: () => void
    mocks.downloadMemberExport
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectExport = reject }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { finishExport = resolve }))

    const user = userEvent.setup()
    renderSettings()
    const dataSection = screen.getByRole('heading', { name: 'Data & security' }).closest('section')
    expect(dataSection).not.toBeNull()
    const data = within(dataSection!)
    await user.click(screen.getByRole('button', { name: /^Request export$/ }))

    const preparing = screen.getByRole('button', { name: 'Preparing export…' })
    expect(preparing).toBeDisabled()
    expect(data.getByText('Preparing your export…')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /^Sign out$/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Change password$/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Delete account$/ })).toBeDisabled()

    fireEvent.click(preparing)
    expect(mocks.downloadMemberExport).toHaveBeenCalledTimes(1)
    rejectExport(new IdentityApiError('Your export could not be prepared. Try again.', {
      code: 'AUTH_STATE_UNAVAILABLE', requestId: 'settings-export-failure', retryable: true, status: 503,
    }))

    const error = await data.findByRole('alert')
    expect(error).toHaveTextContent('Your export could not be prepared. Try again.')
    await waitFor(() => expect(error).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Try export again' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Try export again' }))
    expect(screen.getByRole('button', { name: 'Preparing export…' })).toBeDisabled()
    expect(mocks.downloadMemberExport).toHaveBeenCalledTimes(2)
    finishExport()

    expect(await data.findByText('Your export file is ready.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /^Request export$/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Sign out$/ })).toBeEnabled()
  })
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
