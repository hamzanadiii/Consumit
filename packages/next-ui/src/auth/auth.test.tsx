import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthField, AuthShell } from './auth'

describe('authentication components', () => {
  it('renders the auth shell landmark and heading', () => {
    const { container } = render(
      <AuthShell artworkOverlayClassName="auth-artwork-overlay" title="Welcome back" titleClassName="auth-title">
        <p>Form</p>
      </AuthShell>,
    )

    expect(screen.getByRole('main')).toHaveAttribute('data-consumit-auth-shell')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toHaveClass('auth-title')
    expect(container.querySelector('.auth-artwork-overlay')).toBeInTheDocument()
    expect(container.querySelector('section')).toHaveClass('lg:sticky')
    expect(container.querySelector('section')).toHaveClass('lg:min-h-0')
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
})
