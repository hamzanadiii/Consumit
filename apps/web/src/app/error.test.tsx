import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderWithProviders as render } from '@/test/render'
import PageError from './error'

vi.mock('./home/filscreen-shell', () => ({ FilScreenShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
afterEach(() => vi.restoreAllMocks())

it('uses the framework retry callback and exposes only a safe correlation reference', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const retry = vi.fn()
  render(<PageError error={Object.assign(new Error('secret upstream connection string'), { digest: 'safe-reference' })} retry={retry} />)
  expect(screen.getByText('Reference: safe-reference')).toBeInTheDocument()
  expect(screen.queryByText(/secret upstream/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
})
