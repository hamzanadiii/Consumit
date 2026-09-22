import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { EditBannerButton, ProfileEditProvider, useProfileEdit } from './profile-edit'

function Probe() {
  const { bannerOpen } = useProfileEdit()
  return <p>{`banner:${bannerOpen ? 'open' : 'closed'}`}</p>
}

describe('profile edit triggers', () => {
  it('opens the banner panel from its placement', async () => {
    const user = userEvent.setup()
    render(
      <ProfileEditProvider>
        <EditBannerButton />
        <Probe />
      </ProfileEditProvider>,
    )

    expect(screen.getByText('banner:closed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit banner' }))
    expect(screen.getByText('banner:open')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit banner' })).not.toBeInTheDocument()
  })
})
