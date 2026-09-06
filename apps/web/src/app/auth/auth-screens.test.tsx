import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SignInScreen, SignUpScreen } from './auth-screens'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

describe('preview authentication screens', () => {
  beforeEach(() => {
    push.mockReset()
    window.localStorage.clear()
  })

  it('creates a local preview session and returns to the product after sign in', async () => {
    const user = userEvent.setup()
    render(<SignInScreen titles={[movieSummary]} />)

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(window.localStorage.getItem('consumit.preview-session')).toBe('signed-in')
    expect(push).toHaveBeenCalledWith('/')
  })

  it('starts onboarding after preview social sign-up', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[movieSummary]} />)

    await user.click(screen.getByRole('button', { name: 'Sign up with Google using Google' }))

    expect(window.localStorage.getItem('consumit.preview-session')).toBe('signed-in')
    expect(push).toHaveBeenCalledWith('/onboarding')
  })
})
