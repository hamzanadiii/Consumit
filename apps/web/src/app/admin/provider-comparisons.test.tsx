import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderComparisonRow } from '@/lib/admin-browser'
import { ProviderComparisons } from './provider-comparisons'

const rows: ProviderComparisonRow[] = [
  { provider: 'primary', kind: 'movie', region: 'US', browser: 'all', delivery: 'all', evidence: 'native', starts: 12, startupSamples: 10, startupP50Ms: 600, startupP95Ms: 1800, stallSamples: 2, stallP50Ms: 300, stallP95Ms: 500 },
  { provider: 'primary', kind: 'movie', region: 'US', browser: 'firefox', delivery: 'direct', evidence: 'native', starts: 2, startupSamples: 2, startupP50Ms: 800, startupP95Ms: 1900 },
  { provider: 'primary', kind: 'movie', region: 'US', browser: 'firefox', delivery: 'all', evidence: 'native', starts: 2, startupSamples: 2, startupP50Ms: 800, startupP95Ms: 1900 },
  { provider: 'primary', kind: 'movie', region: 'US', browser: 'all', delivery: 'unattributed', evidence: 'resolution', resolveSuccess: 12, resolveFailures: 3, failureReasons: { empty: 3 } },
  { provider: 'external', kind: 'movie', region: 'US', browser: 'all', delivery: 'all', evidence: 'provider-reported', reportedEvents: { playing: 3, error: 1 } },
  { provider: 'canada', kind: 'movie', region: 'CA', browser: 'all', delivery: 'all', evidence: 'native', starts: 1 },
  { provider: 'anime', kind: 'anime', region: 'US', browser: 'all', delivery: 'all', evidence: 'native', starts: 1 },
]
const props = { available: true, windowMinutes: 15, kind: 'movie' as const, onKindChange: vi.fn() }
function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
  fireEvent.click(screen.getByRole('option', { name: value }))
}
describe('provider comparisons', () => {
  it('keeps native, resolver and external evidence separate without inventing missing durations', () => {
    render(<ProviderComparisons {...props} rows={rows} />)
    expect(screen.getAllByText('Native measurements')).toHaveLength(2)
    expect(screen.getByText('Resolver outcomes')).toBeInTheDocument()
    expect(screen.getByText('Provider-reported events')).toBeInTheDocument()
    expect(screen.getByText('600ms / 1,800ms')).toBeInTheDocument()
    const frame = screen.getByText('external').closest('tr')!
    expect(within(frame).getByText('4 messages')).toBeInTheDocument()
    expect(frame).not.toHaveTextContent('starts')
    expect(within(frame).getAllByText('Unavailable / Unavailable')).toHaveLength(2)
    expect(screen.queryByText('anime')).not.toBeInTheDocument()
  })
  it('filters region, browser and delivery using existing pooled rows, and delegates title kind', () => {
    const kindChange = vi.fn()
    render(<ProviderComparisons {...props} onKindChange={kindChange} rows={rows} />)
    choose('Comparison region', 'US')
    expect(screen.queryByText('canada')).not.toBeInTheDocument()
    choose('Comparison browser', 'firefox')
    expect(screen.queryByText('Resolver outcomes')).not.toBeInTheDocument()
    expect(screen.queryByText('external')).not.toBeInTheDocument()
    expect(screen.getByText('800ms / 1,900ms')).toBeInTheDocument()
    choose('Comparison delivery', 'Direct')
    expect(screen.getByText('800ms / 1,900ms')).toBeInTheDocument()
    choose('Comparison title kind', 'Anime')
    expect(kindChange).toHaveBeenCalledWith('anime')
  })
  it('distinguishes unavailable collection from an empty window', () => {
    const view = render(<ProviderComparisons {...props} available={false} rows={[]} />)
    expect(screen.getByText('Provider comparison metrics unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    view.rerender(<ProviderComparisons {...props} rows={[]} />)
    expect(screen.getByText('No comparison observations')).toBeInTheDocument()
    expect(screen.queryByText('0 starts')).not.toBeInTheDocument()
  })
})
