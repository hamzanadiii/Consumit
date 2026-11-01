import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorPage from './error'
import GlobalError from './global-error'
import NotFound from './not-found'

vi.mock('./home/filscreen-shell', () => ({ FilScreenShell: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => <a className={className} href={href}>{children}</a> }))

afterEach(() => vi.restoreAllMocks())

describe('app-wide route boundaries', () => {
  it('explains missing pages and gives useful destinations', () => {
    render(<NotFound />)

    expect(screen.getByRole('heading', { name: 'We couldn’t find that page', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Search titles' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/')
  })

  it('uses neutral recovery language for errors anywhere in the app', () => {
    const error = new Error('fixture error')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorPage error={error} retry={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'This page hit a snag', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/We couldn’t load this page right now/)).toBeInTheDocument()
  })

  it('keeps a Home route available when the root layout fails', () => {
    render(<GlobalError error={new Error('fixture root error')} />)

    expect(screen.getByRole('heading', { name: "Consumit couldn't open this page", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#consumit-main-content')
  })
})
