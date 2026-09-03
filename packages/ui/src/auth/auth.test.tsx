import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthField, AuthShell, SocialAuthButton, TrustNote } from './auth'

describe('authentication components', () => {
  it('renders the auth shell landmark and heading', () => {
    render(<AuthShell title="Welcome back" titleClassName="auth-title"><p>Form</p></AuthShell>)

    expect(screen.getByRole('main')).toHaveAttribute('data-consumit-auth-shell')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toHaveClass('auth-title')
  })

  it('associates auth field labels and errors', () => {
    render(
      <AuthField
        error="Enter a valid email"
        id="email"
        label="Email"
        trailingAction={<button aria-label="Clear email" type="button">Clear</button>}
      />,
    )

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email')
    expect(screen.getByRole('button', { name: 'Clear email' })).toBeInTheDocument()
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
