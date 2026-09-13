import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MemberLibrary } from '@consumit/contracts'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import { LibraryScreen } from './library-screen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const library: MemberLibrary = { saved: [{ id: movieSummary.id, kind: 'movie', origin: 'native', sourceKey: null }, { id: seriesSummary.id, kind: 'series', origin: 'native', sourceKey: null }], watched: [], diary: [], favorites: [], lists: [] }

describe('personal library shelves', () => {
  it('searches within saved titles, combines type filters, and recovers from no matches', async () => {
    const user = userEvent.setup()
    render(<LibraryScreen library={library} titles={[movieSummary, seriesSummary]} />)
    const shelf = within(screen.getByRole('region', { name: /^On your shelves/ }))
    await user.type(screen.getByRole('searchbox', { name: 'Search your saved titles' }), 'dune')
    expect(shelf.getByRole('link', { name: movieSummary.title })).toBeInTheDocument()
    expect(shelf.queryByRole('link', { name: seriesSummary.title })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Series' }))
    expect(shelf.getByRole('heading', { name: 'No saved titles match.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(shelf.getByRole('link', { name: seriesSummary.title })).toBeInTheDocument()
  })
  it('switches shelf, grid, and list views without losing saved titles', async () => {
    const user = userEvent.setup()
    render(<LibraryScreen library={library} titles={[movieSummary, seriesSummary]} />)
    await user.click(screen.getByRole('radio', { name: 'List' }))
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('2 titles saved')
    await user.click(screen.getByRole('radio', { name: 'Shelves' }))
    expect(screen.getByRole('radio', { name: 'Shelves' })).toBeChecked()
  })
  it('keeps saved records discoverable when title metadata is unavailable', () => {
    render(<LibraryScreen catalogUnavailable library={library} titles={[]} />)
    expect(screen.getByText('Your library is safe. Title details are temporarily unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Movie #${movieSummary.id}` })).toHaveAttribute('href', `/title/${movieSummary.id}`)
  })
})

