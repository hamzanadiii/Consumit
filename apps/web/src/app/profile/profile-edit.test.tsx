import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { EditBannerButton, EditFavoritesButton, ProfileEditProvider, useProfileEdit } from './profile-edit'

function Probe() {
  const { bannerOpen, favoritesOpen } = useProfileEdit()
  return <p>{`banner:${bannerOpen ? 'open' : 'closed'} favorites:${favoritesOpen ? 'open' : 'closed'}`}</p>
}

describe('profile edit triggers', () => {
  it('opens each panel independently from its own placement', async () => {
    const user = userEvent.setup()
    render(
      <ProfileEditProvider>
        <EditBannerButton />
        <EditFavoritesButton />
        <Probe />
      </ProfileEditProvider>,
    )

    expect(screen.getByText('banner:closed favorites:closed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit banner' }))
    expect(screen.getByText('banner:open favorites:closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit banner' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit favorites' }))
    expect(screen.getByText('banner:open favorites:open')).toBeInTheDocument()
  })
})
