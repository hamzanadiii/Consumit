import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ShareProfile } from './share-profile'

describe('ShareProfile', () => {
  it('copies the public profile URL and confirms the action', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    render(<ShareProfile username="alex_sample" />)

    await user.click(screen.getByRole('button', { name: 'Copy profile link' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/profile/alex_sample')))
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Profile link copied to clipboard.')
  })

  it('reports a failure when the clipboard is unavailable', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })

    render(<ShareProfile username="alex_sample" />)

    await user.click(screen.getByRole('button', { name: 'Copy profile link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be copied/i)
  })
})
