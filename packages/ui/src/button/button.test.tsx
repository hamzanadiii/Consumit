import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('uses a safe button type by default', () => {
    render(<Button>Play now</Button>)

    expect(screen.getByRole('button', { name: 'Play now' })).toHaveAttribute(
      'type',
      'button',
    )
  })

  it('forwards interaction to the caller', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Save title</Button>)

    await user.click(screen.getByRole('button', { name: 'Save title' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('announces and blocks interaction while loading', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button loading onClick={onClick}>
        Switching source…
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Switching source…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps disabled ghost actions legible without fading their text', () => {
    render(
      <Button disabled variant="ghost">
        Refresh inventory
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Refresh inventory' })
    expect(button).toHaveClass(
      'disabled:text-muted',
      'disabled:opacity-100',
    )
    expect(button).not.toHaveClass('disabled:opacity-45')
  })
})
