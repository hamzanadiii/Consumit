import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CastPanel, type CastCheckResult } from './cast-panel'

describe('Cast connection panel', () => {
  it('checks, retries a failed SDK load and opens the picker only on selection', async () => {
    const onCheck = vi.fn<() => Promise<CastCheckResult>>()
      .mockRejectedValueOnce(new Error('SDK blocked'))
      .mockResolvedValueOnce('ready')
    const onConnect = vi.fn()
    render(<CastPanel available={false} onCheck={onCheck} onConnect={onConnect} />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking for TVs')
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
    expect(await screen.findByText('Casting is unavailable in this browser.')).toBeInTheDocument()
    expect(onConnect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Choose TV' }))
    expect(onCheck).toHaveBeenCalledTimes(2)
    expect(onConnect).toHaveBeenCalledOnce()
  })

  it('shows setup guidance without claiming a TV connection', async () => {
    const onCheck = vi.fn(async (): Promise<CastCheckResult> => 'unconfigured')
    render(<CastPanel available={false} onCheck={onCheck} onConnect={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('TV casting is being set up'))
    expect(screen.queryByRole('button', { name: 'Choose TV' })).not.toBeInTheDocument()
    expect(screen.getByText(/same Wi-Fi network/)).toBeInTheDocument()
  })

  it('offers a discovered TV immediately and ignores checks after closing', async () => {
    let resolveCheck: (result: CastCheckResult) => void = () => undefined
    const { unmount } = render(<CastPanel available onCheck={() => new Promise((resolve) => { resolveCheck = resolve })} onConnect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Choose TV' })).toBeEnabled()
    unmount()
    resolveCheck('unavailable')
    await Promise.resolve()
  })
})
