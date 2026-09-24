import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'

import { CastCard, SeasonSelector } from './title'

describe('title and series components', () => {
  it('selects seasons through the shared themed listbox', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <SeasonSelector
        onValueChange={onValueChange}
        options={[
          { label: 'Season 1', value: '1' },
          { label: 'Season 2', value: '2' },
        ]}
        value="1"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Season Season 1' }))
    expect(screen.getByRole('listbox', { name: 'Season' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Season 2' }))
    expect(onValueChange).toHaveBeenCalledWith('2')
  })

  it('renders cast anatomy', () => {
    render(<CastCard character="Mara" name="Sara El Amrani" />)

    expect(screen.getByText('Sara El Amrani')).toBeInTheDocument()
    expect(screen.getByText('Mara')).toBeInTheDocument()
  })
})
