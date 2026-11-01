import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PlayerRecoveryPanel } from './player-recovery-panel'

describe('PlayerRecoveryPanel', () => {
  it('announces honest source progress and keeps the actions keyboard reachable', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onChooseSource = vi.fn()
    render(<PlayerRecoveryPanel
      recovery={{ phase: 'searching', kind: 'interrupted', progress: { checked: 2, total: 6 }, checkpointSeconds: 754 }}
      title="The Last City After Rain"
      onCancel={onCancel}
      onChooseSource={onChooseSource}
    />)

    expect(screen.getByRole('dialog', { name: 'Trying another source' })).toHaveTextContent('The Last City After Rain')
    expect(screen.getByRole('status')).toHaveTextContent('Checked 2 of 6 sources')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Choose a source' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose a source' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onChooseSource).toHaveBeenCalledOnce()
  })

  it.each([
    ['startup', 'Couldn’t start playback'],
    ['interrupted', 'Playback was interrupted'],
    ['external', 'This player couldn’t load'],
  ] as const)('uses phase specific recovery copy for %s failures', (kind, heading) => {
    const onRetryAuto = vi.fn()
    const onChooseSource = vi.fn()
    render(<PlayerRecoveryPanel
      recovery={{ phase: 'failed', kind, checkpointSeconds: 754 }}
      title="The Last City After Rain"
      returnHref="/movie/550"
      onRetryAuto={onRetryAuto}
      onChooseSource={onChooseSource}
    />)

    const recovery = screen.getByRole('alertdialog', { name: heading })
    expect(recovery).toHaveTextContent('Your place at 12:34 is saved.')
    expect(recovery).not.toHaveTextContent('Your place is saved.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again with Auto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose a source' }))
    expect(screen.getByRole('link', { name: 'Return to title' })).toHaveAttribute('href', '/movie/550')
    expect(onRetryAuto).toHaveBeenCalledOnce()
    expect(onChooseSource).toHaveBeenCalledOnce()
  })

  it('moves focus into recovery, disables covered player controls, and restores both on exit', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [recoveryOpen, setRecoveryOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setRecoveryOpen(true)}>Open recovery</button>
          <div data-consumit-player>
            <button type="button">Covered player control</button>
            {recoveryOpen ? (
              <PlayerRecoveryPanel
                recovery={{ phase: 'failed', kind: 'interrupted', checkpointSeconds: 754 }}
                title="The Last City After Rain"
                onRetryAuto={() => setRecoveryOpen(false)}
              />
            ) : null}
          </div>
          <button type="button">Episode navigation</button>
        </>
      )
    }

    render(<Harness />)
    const open = screen.getByRole('button', { name: 'Open recovery' })
    const covered = screen.getByRole('button', { name: 'Covered player control' })
    const episodeNavigation = screen.getByRole('button', { name: 'Episode navigation' })
    await user.click(open)

    const heading = screen.getByRole('heading', { name: 'Playback was interrupted' })
    expect(heading).toHaveFocus()
    expect(covered).toHaveProperty('inert', true)
    expect(episodeNavigation.inert).not.toBe(true)

    await user.click(screen.getByRole('button', { name: 'Try again with Auto' }))
    expect(covered.inert).not.toBe(true)
    expect(open).toHaveFocus()
  })
})
