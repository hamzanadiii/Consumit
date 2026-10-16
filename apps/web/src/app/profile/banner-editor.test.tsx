import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'

import { BannerEditor } from './banner-editor'
import { ProfileEditProvider } from './profile-edit'

const mocks = vi.hoisted(() => ({
  browserSearchCatalog: vi.fn(),
  refresh: vi.fn(),
  updateMemberProfile: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('@/lib/catalog-browser', () => ({
  browserSearchCatalog: mocks.browserSearchCatalog,
}))

vi.mock('@/lib/identity-browser', () => ({
  updateMemberProfile: mocks.updateMemberProfile,
}))

const DUNE_BACKDROP = 'https://image.tmdb.org/t/p/w1280/dune.jpg'

describe('profile banner editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    mocks.updateMemberProfile.mockImplementation(async (input: Record<string, unknown>) => input)
  })

  it('picks a wide backdrop from live search and saves it', async () => {
    const user = userEvent.setup()
    mocks.browserSearchCatalog.mockResolvedValue({ items: [movieSummary, seriesSummary], page: 1, totalPages: 1, totalResults: 2 })
    render(<ProfileEditProvider initialBannerOpen><BannerEditor currentBannerUrl={null} /></ProfileEditProvider>)

    await user.type(screen.getByRole('searchbox', { name: 'Search a movie or series for backdrop art' }), 'dune')

    expect(await screen.findByRole('button', { name: 'Use Dune: Part Two as banner' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use Dune: Part Two as banner' }))

    await user.click(screen.getByRole('button', { name: 'Save banner' }))
    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith({ bannerUrl: DUNE_BACKDROP }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('skips titles without wide artwork and removes the banner', async () => {
    const user = userEvent.setup()
    const posterOnly = { ...movieSummary, backdropUrl: null, id: 1, originalTitle: 'Poster Only', title: 'Poster Only' }
    mocks.browserSearchCatalog.mockResolvedValue({ items: [posterOnly, seriesSummary], page: 1, totalPages: 1, totalResults: 2 })
    render(<ProfileEditProvider initialBannerOpen><BannerEditor currentBannerUrl={DUNE_BACKDROP} /></ProfileEditProvider>)

    await user.type(screen.getByRole('searchbox', { name: 'Search a movie or series for backdrop art' }), 'se')

    expect(await screen.findByRole('button', { name: 'Use Severance as banner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use Poster Only as banner' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Save banner' }))
    await waitFor(() => expect(mocks.updateMemberProfile).toHaveBeenCalledWith({ bannerUrl: null }))
  })

  it('surfaces save failures without closing the editor', async () => {
    const user = userEvent.setup()
    mocks.updateMemberProfile.mockRejectedValue(new Error('nope'))
    render(<ProfileEditProvider initialBannerOpen><BannerEditor currentBannerUrl={null} /></ProfileEditProvider>)

    await user.click(screen.getByRole('button', { name: 'Save banner' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
