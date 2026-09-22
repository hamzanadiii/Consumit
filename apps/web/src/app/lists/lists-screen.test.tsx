import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { ListsScreen, type ListsScreenList } from './lists-screen'

const watched: ListsScreenList = {
  description: 'Rainy-day comfort watches.',
  itemCount: 12,
  name: 'Cozy cinema',
  posters: [movieSummary.posterUrl ?? undefined, seriesSummary.posterUrl ?? undefined, undefined, movieSummary.posterUrl ?? undefined, seriesSummary.posterUrl ?? undefined],
  slug: 'cozy-cinema',
  visibility: 'public',
}

const secret: ListsScreenList = {
  description: null,
  itemCount: 1,
  name: 'Guilty pleasures',
  posters: [],
  slug: 'guilty-pleasures',
  visibility: 'private',
}

describe('lists screen', () => {
  it('renders real list cards with collages, counts, and curator proof', () => {
    render(<ListsScreen lists={[watched, secret]} />)

    const card = screen.getByRole('link', { name: 'Cozy cinema, 12 films' })
    expect(card).toHaveAttribute('href', '/lists/cozy-cinema')
    expect(screen.getByText('Rainy-day comfort watches.')).toBeInTheDocument()
    expect(screen.getAllByText('Created by You')).toHaveLength(2)
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Guilty pleasures, 1 film' })).toHaveAttribute('href', '/lists/guilty-pleasures')
  })

  it('keeps an empty shelf honest with a real import destination', () => {
    render(<ListsScreen lists={[]} />)

    expect(screen.getByText(/No lists yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import from Letterboxd' })).toHaveAttribute('href', '/settings/imports/letterboxd')
    expect(screen.getByText(/List discovery hasn't landed yet/)).toBeInTheDocument()
    expect(screen.queryByText(/Taste Match/i)).not.toBeInTheDocument()
  })

  it('names catalog failure without hiding stored lists', () => {
    render(<ListsScreen catalogUnavailable lists={[secret]} />)

    expect(screen.getByRole('status')).toHaveTextContent(/artwork and title details could not load/)
    expect(screen.getByRole('link', { name: 'Guilty pleasures, 1 film' })).toBeInTheDocument()
  })
})
