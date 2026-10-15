import { screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import { ProfileNetworkScreen } from './profile-network-screen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const member = (username: string) => ({ id: username, username, displayName: username, avatarStyle: 'dusk' as const, avatarUrl: null, isFollowing: false, private: false })

it('replaces the relationship list when moving from Followers to Following', () => {
  const { rerender } = render(<ProfileNetworkScreen initialPage={{ collection: 'followers', items: [member('alice')], nextCursor: 'followers-cursor' }} username="hamza" view="followers" />)
  expect(screen.getByRole('link', { name: /alice/ })).toBeInTheDocument()
  rerender(<ProfileNetworkScreen initialPage={{ collection: 'following', items: [member('bob')], nextCursor: null }} username="hamza" view="following" />)
  expect(screen.queryByRole('link', { name: /alice/ })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /bob/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
})

it('clears the previous member list when another profile opens on the same Network view', () => {
  const { rerender } = render(<ProfileNetworkScreen initialPage={{ collection: 'followers', items: [member('alice')], nextCursor: null }} username="hamza" view="followers" />)
  rerender(<ProfileNetworkScreen initialPage={{ collection: 'followers', items: [], nextCursor: null }} username="other_member" view="followers" />)
  expect(screen.queryByRole('link', { name: /alice/ })).not.toBeInTheDocument()
  expect(screen.getByText('No followers to show yet.')).toBeInTheDocument()
})
