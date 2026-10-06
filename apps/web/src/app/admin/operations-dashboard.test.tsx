import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationsDashboard } from './operations-dashboard'

afterEach(() => vi.unstubAllGlobals())
const provider = { id: 'primary', enabled: true, regions: ['US'], role: 'video', mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: 'primary', concurrency: 1, requestsPerMinute: 30, priority: 0 }
const row = { id: 'primary', region: 'US', enabled: true, status: 'down', probe: { ok: false, ms: 500, at: Date.now(), code: 'timeout' }, circuit: { failures: 2, playbackFailures: 1, openUntil: Date.now() + 60000, outcomes: 4, success: 1, latencyMs: 500 } }
function fixture(failedPath?: string) {
  return vi.fn(async (url: string) => {
    if (url === failedPath) throw new Error('Unavailable')
    const data: Record<string, unknown> = {
      '/v1/admin/health': { api: 'ok', store: 'ok' }, '/v1/admin/providers': { providers: [provider] },
      '/v1/admin/providers/health': { movie: [row], series: [], anime: [] },
      '/v1/admin/providers/metrics': { available: false, windowMinutes: 15, metrics: {} },
      '/v1/admin/providers/alerts': { available: false, alerts: [] }, '/v1/admin/providers/changes': { changes: [] },
      '/v1/admin/providers/primary/circuit/reset': {},
    }
    return new Response(JSON.stringify(data[url]), { status: 200 })
  })
}
describe('playback operations dashboard', () => {
  it('retains roster and controls when metrics fail, without inventing zero playback', async () => {
    vi.stubGlobal('fetch', fixture('/v1/admin/providers/metrics'))
    const debug = vi.fn(); const navigate = vi.fn()
    render(<OperationsDashboard active onDebug={debug} onNavigate={navigate} />)
    expect(await screen.findByText('Movies fleet')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Playback metrics')
    expect(screen.getByText('Playback metrics unavailable')).toBeInTheDocument()
    expect(screen.queryByText('0 starts · 0 playback failures · 0 stalls')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }))
    expect(debug).toHaveBeenCalledWith('primary', 'movie')
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
    expect(navigate).toHaveBeenCalledWith('providers')
  })
  it('filters health and applies a circuit reset through its existing API', async () => {
    const fetcher = fixture(); vi.stubGlobal('fetch', fetcher)
    render(<OperationsDashboard active onDebug={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reset circuit for primary' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/v1/admin/providers/primary/circuit/reset', expect.objectContaining({ method: 'POST', body: JSON.stringify({ kind: 'movie' }) })))
    fireEvent.click(screen.getByRole('button', { name: /Health filter/ }))
    fireEvent.click(screen.getByRole('option', { name: 'Unknown' }))
    expect(screen.getByText('No matching providers')).toBeInTheDocument()
  })
})
