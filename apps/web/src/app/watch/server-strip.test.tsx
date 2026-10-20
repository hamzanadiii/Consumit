import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaybackProvider } from '@consumit/contracts'
import { frameName, ServerStrip } from './server-strip'
const servers: PlaybackProvider[] = ['north', 'south', 'west'].map(id => ({ id, label: id, family: id, mirror: 'auto', regions: ['US'], available: true, deliveryMode: 'direct', health: 'ok', subtitles: [] }))
describe('playback servers', () => {
  it('uses the short AniPM name for the YumeZone anime frame', () => {
    expect(frameName({ id: 'yumezoneframe', label: 'AniPM via YumeZone' } as PlaybackProvider)).toBe('AniPM')
  })

  it('keeps labels fixed while recovering and offers selection without member reordering', () => {
    const select = vi.fn()
    const view = render(<ServerStrip servers={servers} active="south" busy={false} loading={false} error={null} onRetry={() => {}} onSelect={select} />)
    const group = screen.getByRole('button', { name: /Consumit Server/ })
    expect(group).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(group)
    fireEvent.click(screen.getByRole('button', { name: /Server 1.*north/ })); expect(select).toHaveBeenCalledWith('north')
    expect(group).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(group)
    expect(screen.queryByRole('button', { name: 'Manage servers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument()
    view.rerender(<ServerStrip servers={servers} active="west" busy loading={false} error={null} onRetry={() => {}} onSelect={select} />)
    expect(screen.getByRole('button', { name: /Server 3.*west/ })).toBeDisabled()
  })
  it('keeps external players separate and retains exact global ordering', () => {
    const select = vi.fn()
    const frame: PlaybackProvider = { ...servers[0]!, id: 'vidfastframe', label: 'vidfastframe', deliveryMode: 'embed' }
    render(<ServerStrip servers={[servers[0]!, frame, servers[1]!]} active="vidfastframe" busy={false} loading={false} error={null} onRetry={() => {}} onSelect={select} />)
    expect(screen.getByRole('button', { name: 'VidFast · External player' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'VidFast · External player' }))
    expect(select).toHaveBeenCalledWith('vidfastframe')
    fireEvent.click(screen.getByRole('button', { name: /Consumit Server/ }))
    expect(screen.getByRole('button', { name: 'Server 3 · south' })).toBeInTheDocument()
  })
})
