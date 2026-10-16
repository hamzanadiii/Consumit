import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { ContinueRail } from './continue-rail'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const batch = {
  items: [movieSummary],
  meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
  missing: [],
}

function seedProgress() {
  window.localStorage.setItem(
    'consumit.progress:guest:movie:693134:0:0',
    JSON.stringify({ completed: false, durationSeconds: 600, id: 693134, kind: 'movie', positionSeconds: 120 }),
  )
}

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('continue rail from device progress', () => {
  it('omits the entire section when nothing is in progress', () => {
    const { container } = render(<ContinueRail />)
    expect(container).toBeEmptyDOMElement()
  })

  it('resolves stored progress to titles with resume destinations', async () => {
    seedProgress()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(batch)))
    render(<ContinueRail />)

    expect(await screen.findByRole('link', { name: 'Continue Dune: Part Two' })).toHaveAttribute(
      'href',
      '/watch/movie/693134',
    )
    expect(screen.getByText('8m left')).toBeInTheDocument()
    expect(screen.getByText('2m of 10m')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Dune: Part Two details' })).toHaveAttribute(
      'href',
      '/title/693134',
    )
  })

  it('hides a failed catalog load without losing progress and recovers on the next visit', async () => {
    seedProgress()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { container, unmount } = render(<ContinueRail />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
    expect(window.localStorage.getItem('consumit.progress:guest:movie:693134:0:0')).not.toBeNull()
    unmount()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(batch)))
    render(<ContinueRail />)
    expect(await screen.findByRole('link', { name: 'Continue Dune: Part Two' })).toBeInTheDocument()
  })

  it('stays absent until its stored titles resolve', async () => {
    seedProgress()
    let resolveFetch!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve })))
    const { container } = render(<ContinueRail />)
    expect(container).toBeEmptyDOMElement()
    await act(async () => {})
    await act(async () => { resolveFetch(Response.json(batch)) })
    expect(await screen.findByRole('heading', { name: 'Continue watching' })).toBeInTheDocument()
  })

  it('stays absent when none of the stored titles can be resolved', async () => {
    seedProgress()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...batch, items: [] })))
    const { container } = render(<ContinueRail />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })

  it('ignores a late batch response after unmount', async () => {
    seedProgress()
    let resolveFetch!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })),
    )
    const { unmount } = render(<ContinueRail />)
    await act(async () => {})
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    unmount()
    resolveFetch(Response.json(batch))
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('ignores completed watches and short previews', async () => {
    window.localStorage.setItem(
      'consumit.progress:guest:movie:1:0:0',
      JSON.stringify({ completed: true, durationSeconds: 600, id: 1, kind: 'movie', positionSeconds: 600 }),
    )
    window.localStorage.setItem(
      'consumit.progress:guest:movie:2:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 2, kind: 'movie', positionSeconds: 10 }),
    )
    render(<ContinueRail />)

    expect(screen.queryByRole('heading', { name: 'Continue watching' })).not.toBeInTheDocument()
  })

  it('drops titles watched to 95 percent as finished', async () => {
    window.localStorage.setItem(
      'consumit.progress:guest:movie:693134:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 693134, kind: 'movie', positionSeconds: 570 }),
    )
    render(<ContinueRail />)

    expect(screen.queryByRole('heading', { name: 'Continue watching' })).not.toBeInTheDocument()
  })

  it('shows overflow titles beyond the old five-card cap', async () => {
    const items = [1, 2, 3, 4, 5, 6].map((id) => ({ ...movieSummary, id, title: `Title ${id}` }))
    items.forEach((item, index) => {
      window.localStorage.setItem(
        `consumit.progress:guest:movie:${item.id}:0:0`,
        JSON.stringify({
          completed: false,
          durationSeconds: 600,
          id: item.id,
          kind: 'movie',
          positionSeconds: 120,
          updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
        }),
      )
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...batch, items })))
    render(<ContinueRail />)

    const links = await screen.findAllByRole('link', { name: /Continue / })
    expect(links).toHaveLength(6)
  })

  it('puts the last-watched title first', async () => {
    // Insert the newest watch first so insertion order alone would get it wrong.
    window.localStorage.setItem(
      'consumit.progress:guest:movie:2:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 2, kind: 'movie', positionSeconds: 120, updatedAt: '2026-02-01T00:00:00.000Z' }),
    )
    window.localStorage.setItem(
      'consumit.progress:guest:movie:1:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 1, kind: 'movie', positionSeconds: 120, updatedAt: '2026-01-01T00:00:00.000Z' }),
    )
    const orderedBatch = {
      ...batch,
      items: [
        { ...movieSummary, id: 1, title: 'Older Title' },
        { ...movieSummary, id: 2, title: 'Newer Title' },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(orderedBatch)))
    render(<ContinueRail />)

    const links = await screen.findAllByRole('link', { name: /Continue / })
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Continue Newer Title',
      'Continue Older Title',
    ])
  })

  it('toggles per-title remove controls through the edit action', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'consumit.progress:guest:movie:693134:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 693134, kind: 'movie', positionSeconds: 120 }),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(batch)))
    render(<ContinueRail />)

    await screen.findByRole('link', { name: 'Continue Dune: Part Two' })
    expect(screen.queryByRole('button', { name: /Remove .* from Continue watching/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Continue watching' }))
    expect(screen.getByRole('button', { name: 'Remove Dune: Part Two from Continue watching' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Done editing Continue watching' }))
    expect(screen.queryByRole('button', { name: /Remove .* from Continue watching/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue Dune: Part Two' })).toBeInTheDocument()
  })

  it('hides a title while preserving its stored progress', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'consumit.progress:guest:movie:1:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 1, kind: 'movie', positionSeconds: 120 }),
    )
    window.localStorage.setItem(
      'consumit.progress:guest:movie:2:0:0',
      JSON.stringify({ completed: false, durationSeconds: 600, id: 2, kind: 'movie', positionSeconds: 120 }),
    )
    const twoBatch = {
      ...batch,
      items: [
        { ...movieSummary, id: 1, title: 'First Title' },
        { ...movieSummary, id: 2, title: 'Second Title' },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(twoBatch)))
    render(<ContinueRail />)

    await screen.findByRole('link', { name: 'Continue First Title' })
    await user.click(screen.getByRole('button', { name: 'Edit Continue watching' }))
    await user.click(screen.getByRole('button', { name: 'Remove First Title from Continue watching' }))

    expect(screen.queryByRole('link', { name: 'Continue First Title' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue Second Title' })).toBeInTheDocument()
    expect(window.localStorage.getItem('consumit.progress:guest:movie:1:0:0')).not.toBeNull()
    expect(JSON.parse(window.localStorage.getItem('consumit.continue-hidden:guest') ?? '{}')['movie:1']).toEqual(expect.any(Number))
    expect(window.localStorage.getItem('consumit.progress:guest:movie:2:0:0')).not.toBeNull()
  })

  it('removes the section after removing the last title', async () => {
    const user = userEvent.setup()
    seedProgress()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(batch)))
    render(<ContinueRail />)

    await screen.findByRole('link', { name: 'Continue Dune: Part Two' })
    await user.click(screen.getByRole('button', { name: 'Edit Continue watching' }))
    await user.click(screen.getByRole('button', { name: 'Remove Dune: Part Two from Continue watching' }))

    expect(screen.queryByRole('heading', { name: 'Continue watching' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('consumit.progress:guest:movie:693134:0:0')).not.toBeNull()
  })
})
