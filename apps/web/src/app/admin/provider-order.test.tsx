import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderOrderEditor, ProviderControlSummary } from './admin-screen'

afterEach(() => vi.unstubAllGlobals())

describe('admin provider order', () => {
  it('shows the saved delivery mode and updates enabled state when provider settings refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'movie', providerIds: ['relay-provider'], revision: 1 }))))
    const provider = { id: 'relay-provider', deliveryMode: 'relay' as const, enabled: true, regions: ['US'], mediaHosts: [], upstreamGroup: 'relay-provider', concurrency: 1, requestsPerMinute: 30, priority: 0, mediaKinds: ['movie'] }
    const view = render(<ProviderOrderEditor providers={[provider]} />)
    const order = await screen.findByRole('list', { name: 'movie provider order' })
    await waitFor(() => expect(order).toHaveTextContent('relay-provider'))
    expect(order).toHaveTextContent('Proxy')
    expect(order).not.toHaveTextContent('Direct')
    view.rerender(<ProviderOrderEditor providers={[{ ...provider, enabled: false }]} />)
    expect(order).toHaveTextContent('Disabled')
    view.rerender(<ProviderOrderEditor providers={[{ ...provider, deliveryMode: 'direct' }]} />)
    expect(order).toHaveTextContent('Direct')
  })
  it('moves a provider with keyboard-accessible controls and saves the complete order', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => new Response(JSON.stringify(init.method === 'PUT'
      ? { kind: 'movie', providerIds: ['second', 'first'], revision: 2 }
      : { kind: 'movie', providerIds: ['first', 'second'], revision: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    const providers = ['first', 'second'].map((id) => ({ id, enabled: true, regions: ['US'], mediaHosts: [], upstreamGroup: id, concurrency: 1, requestsPerMinute: 30, priority: 0,  mediaKinds: ['movie'] }))
    render(<ProviderOrderEditor providers={providers} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move second up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save order' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    const [, options] = fetcher.mock.calls[1]!
    expect(JSON.parse(String(options.body))).toEqual({ providerIds: ['second', 'first'], revision: 1 })
  })
})

describe('admin provider controls', () => {
  it('shows the current enabled count and how to save a provider choice', () => {
    render(<ProviderControlSummary readiness={{ configuredRows: 4, enabledRows: 2 }} />)
    const summary = screen.getByRole('region', { name: 'Provider controls' })
    expect(summary).toHaveTextContent('2 enabled · 4 configured')
    expect(summary).toHaveTextContent('Use the On control in a row, choose its role, then Save')
    expect(summary).toHaveTextContent('Apogee Audio source and Both rows can supply optional added audio')
  })
})
