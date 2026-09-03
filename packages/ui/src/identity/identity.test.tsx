import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar, AvatarGroup, MemberByline, ServiceMark } from './identity'

describe('identity components', () => {
  it('provides accessible standalone avatar identity and a fallback', () => {
    render(<Avatar decorative={false} name="Yasmine El Idrissi" status="online" />)

    expect(
      screen.getByRole('img', { name: 'Yasmine El Idrissi, online' }),
    ).toHaveTextContent('YE')
  })

  it('summarizes a capped member group without repeating decorative names', () => {
    render(
      <AvatarGroup
        items={[
          { name: 'Yasmine' },
          { name: 'Omar' },
          { name: 'Nadia' },
          { name: 'Samir' },
        ]}
        label="Yasmine, Omar, Nadia, and one more friend"
        max={3}
      />,
    )

    expect(
      screen.getByRole('img', {
        name: 'Yasmine, Omar, Nadia, and one more friend',
      }),
    ).toHaveTextContent('+1')
  })

  it('keeps member and service context readable', () => {
    render(
      <>
        <MemberByline
          href="/profile/omar"
          meta="612 films"
          name="Omar"
          status="online"
        />
        <ServiceMark
          description="Used for availability"
          name="Netflix"
          status="connected"
        />
      </>,
    )

    expect(screen.getByRole('link', { name: /Omar/ })).toHaveAttribute(
      'href',
      '/profile/omar',
    )
    expect(screen.getByText(/online/)).toHaveClass('sr-only')
    expect(screen.getByText('Netflix').parentElement?.parentElement).toHaveTextContent(
      'connected',
    )
  })
})
