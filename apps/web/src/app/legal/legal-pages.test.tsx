import type { Metadata } from 'next'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/render'

import DmcaPage, { metadata as dmcaMetadata } from '../dmca/page'
import PrivacyPage, { metadata as privacyMetadata } from '../privacy/page'
import TermsPage, { metadata as termsMetadata } from '../terms/page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/terms',
}))

describe('legal pages', () => {
  it('publishes crawlable titles for each document', () => {
    expect(termsMetadata.title).toBe('Terms of Service · Consumit')
    expect(privacyMetadata.title).toBe('Privacy Policy · Consumit')
    expect(dmcaMetadata.title).toBe('DMCA Notice · Consumit')
    const indexes = (value: Metadata['robots']) => (value && typeof value === 'object' ? value.index : undefined)
    expect([termsMetadata, privacyMetadata, dmcaMetadata].every((value) => indexes(value.robots) === true)).toBe(true)
  })

  it('renders the terms document with an update stamp and section structure', () => {
    renderWithProviders(<TermsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText('Last updated: October 7, 2026')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '5. Third-party sources and availability' })).toBeInTheDocument()
    expect(screen.getByText(/does not host, upload, or store video files/)).toBeInTheDocument()
  })

  it('states the privacy data notice and routes data questions', () => {
    renderWithProviders(<PrivacyPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/Consumit does not host any media/)).toBeInTheDocument()
    expect(screen.getByText(/advertising partner highrevenueformat/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'contact us through the report form' })).toHaveAttribute('href', '/report-issue')
  })

  it('explains the DMCA scope and required notice contents', () => {
    renderWithProviders(<DmcaPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'DMCA Notice' })).toBeInTheDocument()
    expect(screen.getByText(/statement under penalty of perjury/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send your notice through the report form' })).toHaveAttribute('href', '/report-issue')
  })

  it('keeps Terms, Privacy, and DMCA reachable from the shell footer', () => {
    renderWithProviders(<TermsPage />)

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'DMCA' })).toHaveAttribute('href', '/dmca')
  })
})
