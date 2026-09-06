import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SaveTitleButton } from './save-title-button'

describe('save title button', () => {
  it('toggles between save and remove with pressed state', async () => {
    const user = userEvent.setup()
    render(<SaveTitleButton title="Dune: Part Two" />)

    const save = screen.getByRole('button', { name: 'Save Dune: Part Two to library' })
    expect(save).toHaveAttribute('aria-pressed', 'false')
    await user.click(save)
    expect(screen.getByRole('button', { name: 'Remove Dune: Part Two from library' })).toHaveAttribute('aria-pressed', 'true')
  })
})
