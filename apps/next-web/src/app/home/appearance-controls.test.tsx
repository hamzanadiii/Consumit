import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'
import { AppearanceControls, CustomizeMuseum } from './appearance-controls'
import { THEME_INIT_SCRIPT } from './filscreen-theme'
import { ProfileEditorDialog } from '../profile/profile-editor-dialog'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  for (const attribute of ['data-consumit-theme', 'data-consumit-atmosphere', 'data-consumit-profile-layout', 'data-consumit-quiet-motion']) document.documentElement.removeAttribute(attribute)
})

describe('device-local museum appearance', () => {
  it('applies each atmosphere, persists its compatible theme, and restores it across remounts', async () => {
    const user = userEvent.setup()
    const view = render(<AppearanceControls />)
    expect(screen.getByRole('radio', { name: /Cinema/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Paper gallery/ }))
    expect(document.documentElement).toHaveAttribute('data-consumit-theme', 'light')
    expect(window.localStorage.getItem('consumit.next.theme')).toBe('light')
    await user.click(screen.getByRole('radio', { name: /Dusk/ }))
    expect(document.documentElement).toHaveAttribute('data-consumit-theme', 'dark')
    expect(document.documentElement).toHaveAttribute('data-consumit-atmosphere', 'dusk')
    view.unmount()
    render(<AppearanceControls />)
    expect(screen.getByRole('radio', { name: /Dusk/ })).toBeChecked()
  })

  it('persists the journal and quiet motion choices without touching media preferences', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('consumit.player.resolution', '720')
    const view = render(<AppearanceControls />)
    await user.click(screen.getByRole('button', { name: 'Journal' }))
    await user.click(screen.getByRole('switch', { name: 'Quiet motion' }))
    expect(document.documentElement).toHaveAttribute('data-consumit-profile-layout', 'journal')
    expect(document.documentElement).toHaveAttribute('data-consumit-quiet-motion', 'true')
    expect(window.localStorage.getItem('consumit.player.resolution')).toBe('720')
    view.unmount()
    render(<AppearanceControls />)
    expect(screen.getByRole('button', { name: 'Journal' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: 'Quiet motion' })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps a session-only choice usable and explains a storage failure', async () => {
    const user = userEvent.setup()
    render(<><AppearanceControls /><ProfileEditorDialog footer={null} labelledBy="test-editor" onClose={() => {}} title="Pick a favorite"><p>Editor content</p></ProfileEditorDialog></>)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
    await user.click(screen.getByRole('radio', { name: /Paper gallery/ }))
    expect(screen.getByRole('radio', { name: /Paper gallery/ })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-consumit-theme', 'light')
    expect(screen.getByText(/Applied for this visit/)).toBeInTheDocument()
    expect(screen.getByRole('dialog').closest('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  })

  it('opens an inline editor without moving focus away from its trigger', async () => {
    const user = userEvent.setup()
    render(<CustomizeMuseum />)
    const trigger = screen.getByRole('button', { name: 'Customize your museum' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveFocus()
    expect(screen.getByRole('radio', { name: /Cinema/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close customization' }))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('restores the appearance before first paint, normalizes unknown values, and preserves legacy light mode', () => {
    window.localStorage.setItem('consumit.next.atmosphere', 'dusk')
    window.localStorage.setItem('consumit.next.profile-layout', 'journal')
    window.localStorage.setItem('consumit.next.quiet-motion', 'true')
    eval(THEME_INIT_SCRIPT)
    expect(document.documentElement).toHaveAttribute('data-consumit-atmosphere', 'dusk')
    expect(document.documentElement).toHaveAttribute('data-consumit-profile-layout', 'journal')
    expect(document.documentElement).toHaveAttribute('data-consumit-quiet-motion', 'true')
    window.localStorage.setItem('consumit.next.theme', 'light')
    eval(THEME_INIT_SCRIPT)
    expect(document.documentElement).toHaveAttribute('data-consumit-atmosphere', 'gallery')
    window.localStorage.setItem('consumit.next.theme', 'invalid')
    window.localStorage.setItem('consumit.next.atmosphere', 'invalid')
    eval(THEME_INIT_SCRIPT)
    expect(document.documentElement).toHaveAttribute('data-consumit-atmosphere', 'cinema')
  })
})
