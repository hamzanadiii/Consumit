import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProvidersTab } from './provider-management'

afterEach(() => vi.unstubAllGlobals())

describe('provider management', () => {
  it('stages enable changes and updates saved order labels only after Save', async () => {
    let enabled = false
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/fixture/config') && init.method === 'PATCH') { enabled = JSON.parse(String(init.body)).enabled; return new Response(JSON.stringify({ id: 'fixture', enabled })) }
      if (url === '/v1/admin/providers') return new Response(JSON.stringify({ providers: [{ id: 'fixture', deliveryMode: 'relay', proxyApproved: true, role: 'video', enabled, regions: ['US'], mediaHosts: [], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 30, priority: 0, mediaKinds: ['movie'] }] }))
      if (url === '/v1/admin/providers/config') return new Response(JSON.stringify({ overrides: {} }))
      if (url === '/v1/admin/providers/order/movie') return new Response(JSON.stringify({ kind: 'movie', providerIds: ['fixture'], revision: 1 }))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProvidersTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Enable fixture' }))
    expect(enabled).toBe(false)
    expect(screen.getByText('Save to apply')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('list', { name: 'movie provider order' })).toHaveTextContent('Disabled'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'movie provider order' })).toHaveTextContent('Proxy'))
    expect(enabled).toBe(true)
    expect(screen.queryByText('Save to apply')).not.toBeInTheDocument()
    expect(fetcher.mock.calls.filter(([, init]) => init.method === 'PATCH')).toHaveLength(1)
  })
  it('stages, discards, saves and resets Direct/Proxy without claiming Worker approval', async () => {
    let deliveryMode = 'direct'; let overridden = false
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/fixture/config') && init.method === 'PATCH') { deliveryMode = JSON.parse(String(init.body)).deliveryMode; overridden = true; return new Response(JSON.stringify({ id: 'fixture' })) }
      if (url.endsWith('/fixture/config') && init.method === 'DELETE') { deliveryMode = 'direct'; overridden = false; return new Response(null, { status: 204 }) }
      if (url === '/v1/admin/providers') return new Response(JSON.stringify({ readiness: { configuredRows: 1, enabledRows: 1 }, providers: [{ id: 'fixture', deliveryMode, proxyApproved: false, role: 'video', enabled: true, regions: ['US'], mediaHosts: [], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 30, priority: 0, mediaKinds: ['movie'] }] }))
      if (url === '/v1/admin/providers/config') return new Response(JSON.stringify({ overrides: overridden ? { fixture: { deliveryMode } } : {} }))
      if (url === '/v1/admin/providers/order/movie') return new Response(JSON.stringify({ kind: 'movie', providerIds: ['fixture'], revision: 1 }))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProvidersTab />)
    const delivery = await screen.findByRole('combobox', { name: 'Video delivery for fixture' })
    fireEvent.change(delivery, { target: { value: 'relay' } })
    expect(deliveryMode).toBe('direct')
    expect(screen.getByText('Awaiting Worker approval')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('table', { name: 'Provider settings and deletion controls' })).getByRole('button', { name: 'Discard' }))
    expect(delivery).toHaveValue('direct')
    fireEvent.change(delivery, { target: { value: 'relay' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(deliveryMode).toBe('relay'))
    const reset = await screen.findByRole('button', { name: 'Reset settings' })
    expect(JSON.parse(String(fetcher.mock.calls.find(([, init]) => init.method === 'PATCH')?.[1].body))).toEqual({ deliveryMode: 'relay' })
    fireEvent.click(reset)
    await waitFor(() => expect(delivery).toHaveValue('direct'))
  })
  it('keeps the delivery draft when saving fails', async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'PATCH') return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Settings were not saved.' } }), { status: 500 })
      if (url === '/v1/admin/providers') return new Response(JSON.stringify({ readiness: { configuredRows: 1, enabledRows: 1 }, providers: [{ id: 'fixture', deliveryMode: 'direct', role: 'video', enabled: true, regions: ['US'], mediaHosts: [], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 30, priority: 0, mediaKinds: ['movie'] }] }))
      if (url === '/v1/admin/providers/config') return new Response(JSON.stringify({ overrides: {} }))
      if (url === '/v1/admin/providers/order/movie') return new Response(JSON.stringify({ kind: 'movie', providerIds: ['fixture'], revision: 1 }))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProvidersTab />)
    const delivery = await screen.findByRole('combobox', { name: 'Video delivery for fixture' })
    fireEvent.change(delivery, { target: { value: 'relay' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Settings were not saved.')
    expect(delivery).toHaveValue('relay')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
  it('saves a role without presenting it as verified audio capability', async () => {
    let role = 'video'
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/fixture/config') && init.method === 'PATCH') {
        role = JSON.parse(String(init.body)).role
        return new Response(JSON.stringify({ id: 'fixture', role }), { status: 200 })
      }
      if (url === '/v1/admin/providers') return new Response(JSON.stringify({ readiness: { configuredRows: 1, enabledRows: 1 }, providers: [{ id: 'fixture', role, enabled: true, regions: ['US'], mediaHosts: [], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 30, priority: 0, mediaKinds: ['movie'], audioCapabilities: { separateAudio: 'unverified', languages: [], health: 'untested' } }] }))
      if (url === '/v1/admin/providers/config') return new Response(JSON.stringify({ overrides: role === 'video' ? {} : { fixture: { role } } }))
      if (url === '/v1/admin/providers/order/movie') return new Response(JSON.stringify({ kind: 'movie', providerIds: role === 'audio' ? [] : ['fixture'], revision: 1 }))
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<ProvidersTab />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Role for fixture' }), { target: { value: 'audio' } })
    expect(role).toBe('video')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(role).toBe('audio'))
    expect(await screen.findByText('fixture settings saved.')).toBeInTheDocument()
    expect(screen.getByText('Separate audio: unverified · Untested')).toBeInTheDocument()
  })
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
