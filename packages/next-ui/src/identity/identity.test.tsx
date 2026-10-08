import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar, ServiceMark } from './identity'

describe('identity components', () => {
  it('provides accessible standalone avatar identity and a fallback', () => {
    render(<Avatar decorative={false} name="Yasmine El Idrissi" status="online" />)

    expect(
      screen.getByRole('img', { name: 'Yasmine El Idrissi, online' }),
    ).toHaveTextContent('YE')
  })

  it('renders the member-chosen tile treatment with dusk as the default', () => {
    const { container, rerender } = render(<Avatar decorative={false} name="Hamza" />)

    const tile = container.querySelector('[data-consumit-avatar]')
    expect(tile).toHaveAttribute('data-treatment', 'dusk')
    expect(tile?.className).toMatch(/linear-gradient\(135deg,#e29a72/)

    rerender(<Avatar decorative={false} name="Hamza" treatment="halo" />)
    expect(container.querySelector('[data-consumit-avatar]')).toHaveAttribute('data-treatment', 'halo')
    expect(container.querySelector('[data-consumit-avatar]')?.querySelector('[aria-hidden="true"].rounded-full.border')).toBeInTheDocument()

    rerender(<Avatar decorative={false} name="Hamza" treatment="noir" />)
    expect(container.querySelector('[data-consumit-avatar]')?.className).toMatch(/bg-surface-raised/)
  })

  it('shows the supplied portrait and falls back to initials when it fails', () => {
    const { container, rerender } = render(
      <Avatar decorative={false} imageAlt="Hamza portrait" name="Hamza" src="https://api.dicebear.com/7.x/notionists/svg?seed=abc" />,
    )

    const portrait = screen.getByRole('img', { name: 'Hamza portrait' })
    expect(portrait).toHaveAttribute('src', 'https://api.dicebear.com/7.x/notionists/svg?seed=abc')
    expect(container.querySelector('[data-consumit-avatar]')?.className).toMatch(/bg-surface-raised/)
    expect(container.querySelector('[data-consumit-avatar]')?.className).not.toMatch(/linear-gradient/)

    fireEvent.error(portrait)
    expect(screen.queryByRole('img', { name: 'Hamza portrait' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-consumit-avatar]')).toHaveTextContent('H')

    rerender(<Avatar decorative={false} name="Hamza" src={undefined} />)
    expect(container.querySelector('[data-consumit-avatar]')).toHaveTextContent('H')
  })

  it('keeps service context readable', () => {
    render(
      <ServiceMark
        description="Used for availability"
        name="Netflix"
        status="connected"
      />,
    )

    expect(screen.getByText('Netflix').parentElement?.parentElement).toHaveTextContent(
      'connected',
    )
  })
})
