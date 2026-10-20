import { createRef } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PlayerServerMenu } from './player-server-menu'

it('shows every source in All while keeping native and external groups distinct', () => {
  const chooseServer = vi.fn()
  render(<PlayerServerMenu menuRef={createRef()} model={{ auto: true, busy: false, loading: false, error: null, hasOtherServers: true, favorites: [], groups: [{ family: '', options: [
    { value: 'native', label: 'Server 1', delivery: 'direct' },
    { value: 'frame', label: 'Vixsrc', delivery: 'embed' },
  ] }] }} actions={{ chooseServer, toggleFavorite: vi.fn(), close: vi.fn(), back: vi.fn() }} />)
  const native = screen.getByRole('group', { name: 'Consumit Server' })
  const external = screen.getByRole('group', { name: 'External players' })
  expect(within(native).getByRole('button', { name: 'Server 1' })).toBeInTheDocument()
  expect(within(external).getByRole('button', { name: 'Vixsrc' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /All/ })).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByRole('tab', { name: /External/ }))
  expect(within(external).getByText('Vixsrc')).toBeInTheDocument()
  expect(screen.getByText(/Fallback players/)).toBeInTheDocument()
  fireEvent.click(within(external).getByRole('button', { name: 'Vixsrc' }))
  expect(chooseServer).toHaveBeenCalledWith('frame')
})

it('searches without changing source order and supports keyboard group switching', () => {
  const chooseServer = vi.fn()
  render(<PlayerServerMenu menuRef={createRef()} model={{ auto: false, selected: 'second', busy: false, loading: false, error: null, hasOtherServers: true, favorites: [], groups: [{ family: '', options: [
    { value: 'first', label: 'Server 1', detail: 'Rigel', delivery: 'direct' }, { value: 'second', label: 'Server 2', detail: 'CookieBakers', delivery: 'direct' }, { value: 'frame', label: 'VidRift', delivery: 'embed' },
  ] }] }} actions={{ chooseServer, toggleFavorite: vi.fn(), close: vi.fn(), back: vi.fn() }} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search sources' }), { target: { value: 'cookie' } })
  expect(screen.queryByRole('button', { name: 'Server 1' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Server 2' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(screen.getByRole('tab', { name: /All/ }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: /Consumit/ })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('tab', { name: /Consumit/ }), { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: /External/ })).toHaveFocus()
  expect(screen.getByRole('textbox')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'VidRift' }))
  expect(chooseServer).toHaveBeenCalledWith('frame')
})
