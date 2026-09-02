import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthField, AuthShell, SocialAuthButton, TrustNote } from './auth'

describe('authentication components', () => {
  it('renders the auth shell landmark and heading', () => {
    render(<AuthShell title="Welcome back"><p>Form</p></AuthShell>)

    expect(screen.getByRole('main')).toHaveAttribute('data-consumit-auth-shell')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('associates auth field labels and errors', () => {
    render(<AuthField error="Enter a valid email" id="email" label="Email" />)

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email')
  })

  it('names social auth and trust content', () => {
    render(
      <>
        <SocialAuthButton label="Continue with Google" provider="Google" />
        <TrustNote title="You stay in control">Imports can be deleted.</TrustNote>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Continue with Google using Google' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'You stay in control' })).toBeInTheDocument()
  })
})
