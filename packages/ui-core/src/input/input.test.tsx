import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Label } from '../label/label'
import { Input } from './input'

describe('Label and Input', () => {
  it('connects a persistent label to its input', () => {
    render(
      <>
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" />
      </>,
    )

    expect(screen.getByLabelText('Display name')).toHaveAttribute('type', 'text')
  })

  it('preserves native input attributes and values', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          defaultValue="hamza@example.com"
          id="email"
          type="email"
        />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveValue('hamza@example.com')
  })

  it('exposes invalid and disabled states to assistive technology', () => {
    render(
      <>
        <Label htmlFor="username">Username</Label>
        <Input aria-invalid="true" disabled id="username" />
      </>,
    )

    const input = screen.getByRole('textbox', { name: 'Username' })
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('preserves the native read-only contract', () => {
    render(
      <>
        <Label htmlFor="location">Location</Label>
        <Input defaultValue="Rabat, Morocco" id="location" readOnly />
      </>,
    )

    expect(screen.getByRole('textbox', { name: 'Location' })).toHaveAttribute(
      'readonly',
    )
  })
})
