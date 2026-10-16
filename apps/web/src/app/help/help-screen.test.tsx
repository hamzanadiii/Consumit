import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import HelpPage from './page'

describe('Help Center', () => {
  it('answers the active viewing, social, and account questions with working destinations', () => {
    render(<HelpPage />)

    expect(screen.getByRole('heading', { name: 'A little help, when you need it.' })).toBeInTheDocument()
    expect(screen.getByText('Why can I find a title but not play it?')).toBeInTheDocument()
    expect(screen.getByText('Where do my watches, reviews, and lists appear?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'reset your password' })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: 'report a playback issue' })).toHaveAttribute('href', '/report-issue?category=playback')
    expect(screen.getAllByRole('link', { name: 'Report an issue' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Report an issue' }).every((link) => link.getAttribute('href') === '/report-issue')).toBe(true)
  })
})
