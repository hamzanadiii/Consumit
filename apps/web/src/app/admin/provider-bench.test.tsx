import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderBench } from './provider-bench'
import { inspectionReport } from './admin-report'
import type { ProviderInspection } from '@/lib/admin-browser'
import { movieSummary } from '@/test/catalog-fixtures'

afterEach(() => vi.unstubAllGlobals())
const candidates = ['alpha', 'beta', 'gamma', 'delta'].map(id => ({ id, mediaKinds: ['movie'], regions: ['US'], upstreamGroup: id, mediaHosts: ['media.example'], configured: false, separateAudio: false }))
const result: ProviderInspection = { providerId: 'alpha', ok: true, code: 'resolved', elapsedMs: 90, region: 'US', rejectedSources: 0,
  sources: [{ key: 'private-key', host: 'media.example', type: 'hls', language: 'en', subtitleCount: 2 }],
  preview: { src: 'https://media.example/master.m3u8?token=secret', type: 'hls', expiresAt: '2099-01-01T00:00:00.000Z' } }
describe('bounded provider bench', () => {
  it('uses the correct catalog, sample labels and exact episode identity for each title kind', async () => {
    const provider = { ...candidates[0], id: 'alpha', mediaKinds: ['anime', 'series'], role: 'video', enabled: true }
    const fetcher = vi.fn(async (url: string, options: RequestInit) => new Response(JSON.stringify(options.method === 'GET' ? { providers: [provider], readiness: { configuredRows: 1, enabledRows: 1, removedRows: 0 } } : result)))
    vi.stubGlobal('fetch', fetcher)
    const view = render(<ProviderBench mode="configured" active target={{ id: 'alpha', kind: 'anime', version: 1 }} onManage={vi.fn()} />)
    await screen.findByRole('checkbox', { name: 'Select alpha' })
    expect(screen.getByText('One Piece · AniList 178018')).toBeInTheDocument()
    expect(screen.getByText('Sample title')).toBeInTheDocument()
    expect(screen.getByLabelText('Audio language code')).toHaveValue('ja')
    fireEvent.change(screen.getByLabelText('Canonical episode'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await screen.findByText('Sources validated · 90ms · US')
    expect(JSON.parse(String(fetcher.mock.calls.find(([url]) => url.endsWith('/inspect'))?.[1].body))).toMatchObject({ ref: { kind: 'anime', id: 178018, episode: 12 }, audioLanguage: 'ja' })
    view.rerender(<ProviderBench mode="configured" active target={{ id: 'alpha', kind: 'series', version: 2 }} onManage={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Game of Thrones (2011) · TMDB 1399')).toBeInTheDocument())
    expect(screen.getByLabelText('Audio language code')).toHaveValue('en')
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Episode'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/inspect'))).toHaveLength(2))
    expect(JSON.parse(String(fetcher.mock.calls.filter(([url]) => url.endsWith('/inspect')).at(-1)?.[1].body))).toMatchObject({ providerId: 'alpha', ref: { kind: 'series', id: 1399, season: 2, episode: 5 }, audioLanguage: 'en' })
  })
  it('runs only selected reviewed candidates and leaves browser evidence unchecked', async () => {
    const fetcher = vi.fn(async (url: string, options: RequestInit) => new Response(JSON.stringify(options.method === 'GET' && url.endsWith('/scout') ? { candidates } : result)))
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderBench mode="scout" active onManage={vi.fn()} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select alpha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    expect(await screen.findByText('Sources validated · 90ms · US')).toBeInTheDocument()
    expect(screen.queryByText('First frame confirmed')).not.toBeInTheDocument()
    expect(screen.getByText('Decode:')).toHaveTextContent('Unchecked')
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/inspect'))).toHaveLength(1)
    expect(JSON.parse(String(fetcher.mock.calls.find(([url]) => url.endsWith('/inspect'))?.[1].body))).toEqual({ providerId: 'alpha', ref: { kind: 'movie', id: 550 }, audioLanguage: 'en', scope: 'scout' })
    expect(screen.getByRole('button', { name: 'Browser check' })).toBeInTheDocument()
    expect(fetcher.mock.calls.some(([url]) => url.includes('/config'))).toBe(false)
  })
  it('selects and sequentially tests every compatible provider in the filtered roster', async () => {
    const fetcher = vi.fn(async (url: string, options: RequestInit) => url.endsWith('/scout')
      ? new Response(JSON.stringify({ candidates }))
      : new Response(JSON.stringify({ ...result, providerId: JSON.parse(String(options.body)).providerId })))
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderBench mode="scout" active onManage={vi.fn()} />)
    await screen.findByRole('checkbox', { name: 'Select alpha' })
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }))
    expect(screen.getByText('4 selected · Sequential tests · up to 15s per provider')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select delta' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    expect(await screen.findByText(/Run complete · 4 \/ 4 resolved/)).toBeInTheDocument()
    const inspectCalls = fetcher.mock.calls.filter(([url]) => url.endsWith('/inspect'))
    expect(inspectCalls).toHaveLength(4)
    expect(inspectCalls.map(([, options]) => JSON.parse(String(options.body)).providerId)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
  })
  it('stops an all-provider run and marks unstarted checks as stopped', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('/scout') ? new Response(JSON.stringify({ candidates })) : new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderBench mode="scout" active onManage={vi.fn()} />)
    await screen.findByRole('checkbox', { name: 'Select alpha' })
    fireEvent.click(screen.getByRole('button', { name: 'Select all shown' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(screen.getByText('Resolving…')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Stop run' }))
    expect(screen.getAllByText('Stopped')).toHaveLength(4)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/inspect'))).toHaveLength(1)
  })
  it('runs against a roster without deployment-specific inspection flags', async () => {
    const provider = { ...candidates[0], id: 'alpha', mediaKinds: ['movie'], role: 'video', enabled: true }
    const fetcher = vi.fn(async (url: string, options: RequestInit) => new Response(JSON.stringify(options.method === 'GET' ? { providers: [provider], readiness: { configuredRows: 1, enabledRows: 1, removedRows: 0 } } : result)))
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderBench mode="configured" active target={{ id: 'alpha', kind: 'movie', version: 1 }} onManage={vi.fn()} />)

    await screen.findByRole('checkbox', { name: 'Select alpha' })
    expect(screen.getByRole('button', { name: 'Run tests' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await screen.findByText('Sources validated · 90ms · US')
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/inspect'))).toBe(true)
  })
  it('searches the catalog and tests the selected exact movie identity', async () => {
    const provider = { ...candidates[0], id: 'alpha', mediaKinds: ['movie'], role: 'video', enabled: true }
    const page = { items: [movieSummary], page: 1, totalPages: 1, totalResults: 1, meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false } }
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      if (url.startsWith('/v1/titles/search?')) return Response.json(page)
      return Response.json(options.method === 'GET' ? { providers: [provider], readiness: { configuredRows: 1, enabledRows: 1, removedRows: 0 } } : result)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderBench mode="configured" active target={{ id: 'alpha', kind: 'movie', version: 1 }} onManage={vi.fn()} />)
    await screen.findByRole('checkbox', { name: 'Select alpha' })
    fireEvent.change(screen.getByLabelText('Search the catalog'), { target: { value: 'Dune' } })
    fireEvent.click(await screen.findByRole('button', { name: /Dune: Part Two/ }))
    expect(screen.getByText('Dune: Part Two (2024) · TMDB 693134')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await screen.findByText('Sources validated · 90ms · US')
    expect(JSON.parse(String(fetcher.mock.calls.find(([url]) => url.endsWith('/inspect'))?.[1].body))).toMatchObject({ ref: { kind: 'movie', id: 693134 } })
  })
  it('exports explicit evidence without signed media, source keys or raw errors', () => {
    const report = JSON.stringify(inspectionReport({ kind: 'movie', id: 550 }, [{ id: 'alpha', status: 'resolved', result, browser: { decoded: true, startupMs: 200, stalls: 1, seeked: true } }]))
    expect(report).toContain('media.example'); expect(report).toContain('"seeked":true')
    expect(report).not.toContain('secret'); expect(report).not.toContain('https://'); expect(report).not.toContain('private-key')
  })
})
