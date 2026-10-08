import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderBench } from './provider-bench'
import { inspectionReport } from './admin-report'
import type { ProviderInspection } from '@/lib/admin-browser'

afterEach(() => vi.unstubAllGlobals())
const candidates = ['alpha', 'beta', 'gamma', 'delta'].map(id => ({ id, mediaKinds: ['movie'], regions: ['US'], upstreamGroup: id, mediaHosts: ['media.example'], configured: false, separateAudio: false }))
const result: ProviderInspection = { providerId: 'alpha', ok: true, code: 'resolved', elapsedMs: 90, region: 'US', rejectedSources: 0,
  sources: [{ key: 'private-key', host: 'media.example', type: 'hls', language: 'en', subtitleCount: 2 }],
  preview: { src: 'https://media.example/master.m3u8?token=secret', type: 'hls', expiresAt: '2099-01-01T00:00:00.000Z' } }
describe('bounded provider bench', () => {
  it('uses the correct catalog and audio defaults when debugging another title kind', async () => {
    const provider = { ...candidates[0], id: 'alpha', mediaKinds: ['anime', 'series'], role: 'video', enabled: true }
    const fetcher = vi.fn(async (url: string, options: RequestInit) => new Response(JSON.stringify(options.method === 'GET' ? { providers: [provider] } : result)))
    vi.stubGlobal('fetch', fetcher)
    const view = render(<ProviderBench mode="configured" active target={{ id: 'alpha', kind: 'anime', version: 1 }} onManage={vi.fn()} />)
    await screen.findByRole('checkbox', { name: 'Select alpha' })
    expect(screen.getByLabelText('AniList ID')).toHaveValue('178018')
    expect(screen.getByLabelText('Audio code')).toHaveValue('ja')
    view.rerender(<ProviderBench mode="configured" active target={{ id: 'alpha', kind: 'series', version: 2 }} onManage={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('TMDB ID')).toHaveValue('1399'))
    expect(screen.getByLabelText('Audio code')).toHaveValue('en')
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await screen.findByText('Sources validated · 90ms · US')
    expect(JSON.parse(String(fetcher.mock.calls.find(([url]) => url.endsWith('/inspect'))?.[1].body))).toMatchObject({ providerId: 'alpha', ref: { kind: 'series', id: 1399, season: 1, episode: 1 }, audioLanguage: 'en' })
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
  it('limits selection to three and stops queued work without starting remaining candidates', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('/scout') ? new Response(JSON.stringify({ candidates })) : new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetcher)
    render(<ProviderBench mode="scout" active onManage={vi.fn()} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select alpha' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select beta' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select gamma' }))
    expect(screen.getByRole('checkbox', { name: 'Select delta' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    await waitFor(() => expect(screen.getByText('Resolving…')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Stop run' }))
    expect(screen.getAllByText('Stopped')).toHaveLength(3)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/inspect'))).toHaveLength(1)
  })
  it('exports explicit evidence without signed media, source keys or raw errors', () => {
    const report = JSON.stringify(inspectionReport({ kind: 'movie', id: 550 }, [{ id: 'alpha', status: 'resolved', result, browser: { decoded: true, startupMs: 200, stalls: 1, seeked: true } }]))
    expect(report).toContain('media.example'); expect(report).toContain('"seeked":true')
    expect(report).not.toContain('secret'); expect(report).not.toContain('https://'); expect(report).not.toContain('private-key')
  })
})
