import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { PreviewSessionProvider, usePreviewSession } from './preview-session'

function SessionProbe() {
  const { signIn, signOut, signedIn } = usePreviewSession()

  return (
    <div>
      <output>{signedIn ? 'signed in' : 'signed out'}</output>
      <button onClick={signIn} type="button">Sign in</button>
      <button onClick={signOut} type="button">Sign out</button>
    </div>
  )
}

describe('PreviewSessionProvider', () => {
  beforeEach(() => window.localStorage.clear())

  it('persists sign-in and sign-out state for frontend previews', async () => {
    const user = userEvent.setup()
    render(
      <PreviewSessionProvider>
        <SessionProbe />
      </PreviewSessionProvider>,
    )

    expect(screen.getByText('signed out')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('signed in')).toBeInTheDocument()
    expect(window.localStorage.getItem('consumit.preview-session')).toBe('signed-in')

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByText('signed out')).toBeInTheDocument()
    expect(window.localStorage.getItem('consumit.preview-session')).toBeNull()
  })

  it('restores the preview session after the app remounts', async () => {
    window.localStorage.setItem('consumit.preview-session', 'signed-in')

    render(
      <PreviewSessionProvider>
        <SessionProbe />
      </PreviewSessionProvider>,
    )

    expect(await screen.findByText('signed in')).toBeInTheDocument()
  })
})
