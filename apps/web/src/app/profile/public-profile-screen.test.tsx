import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemberProfileData } from '@consumit/contracts'
import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { ProfileScreen } from './public-profile-screen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const profile: MemberProfileData = {
  canonicalUsername: 'alex_sample', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Alex', location: null, nextUsernameChangeAt: null, username: 'alex_sample', usernameChangedAt: null, visibility: 'public' },
  diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { diaryEntries: 0, lists: 0, reviews: 0, watched: 0 },
}

describe('profile as a personal cinema', () => {
  it('keeps an empty public profile honest and hides owner editing controls', () => {
    render(<ProfileScreen data={profile} titles={[]} />)
    expect(screen.getByText('This member has not picked favorites yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit favorites' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'In the favorites' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Taste Match/i)).not.toBeInTheDocument()
  })
  it('derives genre evidence from available Favorites while preserving unavailable title destinations', () => {
    render(<ProfileScreen catalogUnavailable data={{ ...profile, favorites: [{ id: movieSummary.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }, { id: 99, kind: 'movie', position: 2, origin: 'native', sourceKey: null }] }} titles={[movieSummary]} />)
    expect(screen.getByText('Genres across 1 selected title.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Movie #99' })).toHaveAttribute('href', '/title/99')
    expect(screen.getByText('Your profile is available, but TMDB artwork and title details could not load.')).toBeInTheDocument()
  })
})
