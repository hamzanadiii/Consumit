import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProvidersTab } from './provider-management'

afterEach(() => vi.unstubAllGlobals())

describe('provider management', () => {
  it('requires confirmation before deleting a provider and refreshes the fleet', async () => {
    let removed = false
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/v1/admin/providers/fixture' && init.method === 'DELETE') {
        removed = true
        return new Response(JSON.stringify({ id: 'fixture', removed: true, enabled: false }), { status: 200 })
      }
      if (url === '/v1/admin/providers') return new Response(JSON.stringify({ readiness: { configuredRows: removed ? 0 : 1, enabledRows: removed ? 0 : 1, removedRows: removed ? 1 : 0 }, providers: [{ id: 'fixture', enabled: !removed, removed, regions: ['US'], configuredRegions: ['US'], mediaHosts: [], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 30, priority: 0,   mediaKinds: ['movie'] }] }), { status: 200 })
      if (url === '/v1/admin/providers/config') return new Response(JSON.stringify({ overrides: {} }), { status: 200 })
      if (url === '/v1/admin/providers/order/movie') return new Response(JSON.stringify({ kind: 'movie', providerIds: removed ? [] : ['fixture'], revision: removed ? 2 : 1 }), { status: 200 })
      throw new Error(`Unexpected request: ${init.method} ${url}`)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProvidersTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete fixture' }))
    expect(removed).toBe(false)
    expect(screen.getByText(/Saved progress stays available/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await waitFor(() => expect(removed).toBe(true))
    expect(await screen.findByText(/fixture deleted from playback/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete fixture' })).not.toBeInTheDocument()
  })
})
