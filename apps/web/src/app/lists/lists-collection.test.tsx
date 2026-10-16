import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { ListsCollection, type ListCollectionItem } from './lists-collection'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const watched: ListCollectionItem = {
  description: 'Rainy-day comfort watches.',
  itemCount: 12,
  name: 'Cozy cinema',
  posters: [movieSummary.posterUrl ?? undefined, seriesSummary.posterUrl ?? undefined, undefined, movieSummary.posterUrl ?? undefined, seriesSummary.posterUrl ?? undefined],
  curator: 'You',
  username: 'cinema_fan',
  slug: 'cozy-cinema',
  visibility: 'private',
  savedByViewer: false,
  isOwner: true,
}

const secret: ListCollectionItem = {
  description: null,
  itemCount: 1,
  name: 'Guilty pleasures',
  posters: [],
  curator: 'You',
  username: 'cinema_fan',
  slug: 'guilty-pleasures',
  visibility: 'private',
  savedByViewer: false,
  isOwner: true,
}

describe('profile lists collection', () => {
  it('renders real list cards with collages, counts, and curator proof', () => {
    render(<ListsCollection lists={[watched, secret]} />)

    const card = screen.getByRole('link', { name: 'Cozy cinema, 12 titles' })
    expect(card).toHaveAttribute('href', '/lists/cozy-cinema')
    expect(screen.getByText('Rainy-day comfort watches.')).toBeInTheDocument()
    expect(screen.getAllByText('Created by You')).toHaveLength(2)
    expect(screen.getAllByText('Private').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Guilty pleasures, 1 title' })).toHaveAttribute('href', '/lists/guilty-pleasures')
  })

  it('keeps an empty shelf honest with a real next step', () => {
    render(<ListsCollection lists={[]} />)

    expect(screen.getByText(/No lists yet/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /import/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Taste Match/i)).not.toBeInTheDocument()
  })

  it('names catalog failure without hiding stored lists', () => {
    render(<ListsCollection catalogUnavailable lists={[secret]} />)

    expect(screen.getByRole('status')).toHaveTextContent(/artwork and title details could not load/)
    expect(screen.getByRole('link', { name: 'Guilty pleasures, 1 title' })).toBeInTheDocument()
  })

  it('searches private lists without public or shared controls', async () => {
    const user = userEvent.setup()
    render(<ListsCollection lists={[watched, secret]} />)
    await user.type(screen.getByRole('searchbox', { name: 'Search your lists' }), 'guilty')
    expect(screen.getByRole('link', { name: 'Guilty pleasures, 1 title' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Cozy cinema, 12 titles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Filter your lists by visibility' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Saved lists' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create list' })).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search your lists' }))
    expect(screen.getByRole('link', { name: 'Cozy cinema, 12 titles' })).toBeInTheDocument()
  })
})
