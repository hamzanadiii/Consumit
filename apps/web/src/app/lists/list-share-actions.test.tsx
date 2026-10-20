import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { ListShareActions } from './list-share-actions'

vi.mock('@/lib/identity-browser', () => ({
  removeSavedMemberList: vi.fn(async () => {}),
  saveMemberList: vi.fn(async () => {}),
}))

import { removeSavedMemberList, saveMemberList } from '@/lib/identity-browser'

describe('list share actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shares a public list link and toggles its private bookmark', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<ListShareActions isOwner={false} listId="list-42" saved={false} signedIn slug="best-of-autumn" />)

    await user.click(screen.getByRole('button', { name: 'Share list' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/lists/best-of-autumn`)
    expect(screen.getByRole('status')).toHaveTextContent('List link copied.')

    await user.click(screen.getByRole('button', { name: 'Save list' }))
    expect(saveMemberList).toHaveBeenCalledWith('best-of-autumn')
    expect(await screen.findByRole('button', { name: 'Remove saved list' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove saved list' }))
    expect(removeSavedMemberList).toHaveBeenCalledWith('list-42')
    expect(await screen.findByRole('button', { name: 'Save list' })).toBeInTheDocument()
  })

  it('keeps public links shareable to guests and routes Save through sign-in', () => {
    render(<ListShareActions isOwner={false} listId="list-42" saved={false} signedIn={false} slug="best-of-autumn" />)
    expect(screen.getByRole('button', { name: 'Share list' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in to save' })).toHaveAttribute('href', '/sign-in?next=%2Flists%2Fbest-of-autumn')
  })
})
