import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaybackProvider } from '@consumit/contracts'
import { ServerStrip } from './server-strip'
const servers: PlaybackProvider[] = ['north', 'south', 'west'].map(id => ({ id, label: id, family: id, mirror: 'auto', regions: ['US'], available: true, deliveryMode: 'direct', health: 'ok', subtitles: [] }))
describe('personal servers', () => {
  it('keeps labels fixed while recovering and offers accessible reordering and reset', () => {
    const order = vi.fn(), select = vi.fn()
    const view = render(<ServerStrip servers={servers} active="south" busy={false} loading={false} error={null} onRetry={() => {}} onSelect={select} onOrder={order} />)
    const group = screen.getByRole('button', { name: /Consumit Server/ })
    expect(group).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(group)
    fireEvent.click(screen.getByRole('button', { name: /Server 1.*north/ })); expect(select).toHaveBeenCalledWith('north')
    expect(group).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(group)
    fireEvent.click(screen.getByRole('button', { name: 'Manage servers' }))
    expect(screen.getByRole('button', { name: 'Move north up' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Move south up' })); expect(order).toHaveBeenLastCalledWith(['south', 'north', 'west'])
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' })); expect(order).toHaveBeenLastCalledWith([])
    view.rerender(<ServerStrip servers={servers} active="west" busy loading={false} error={null} onRetry={() => {}} onSelect={select} onOrder={order} />)
    expect(screen.getByRole('button', { name: /Server 3.*west/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move south up' })).toBeDisabled()
  })
  it('keeps external players separate and retains exact global ordering', () => {
    const select = vi.fn(), order = vi.fn()
    const frame: PlaybackProvider = { ...servers[0]!, id: 'vidfastframe', label: 'vidfastframe', deliveryMode: 'embed' }
    render(<ServerStrip servers={[servers[0]!, frame, servers[1]!]} active="vidfastframe" busy={false} loading={false} error={null} onRetry={() => {}} onSelect={select} onOrder={order} />)
    expect(screen.getByRole('button', { name: 'VidFast · External player' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'VidFast · External player' }))
    expect(select).toHaveBeenCalledWith('vidfastframe')
    fireEvent.click(screen.getByRole('button', { name: /Consumit Server/ }))
    expect(screen.getByRole('button', { name: 'Server 3 · south' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Manage servers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move south up' }))
    expect(order).toHaveBeenLastCalledWith(['north', 'south', 'vidfastframe'])
  })
})
