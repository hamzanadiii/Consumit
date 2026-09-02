import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CompatibilityPanel, DiaryRow, ProfileMasthead, TasteSignature } from './profile'

describe('profile components', () => {
  it('renders profile identity, context, stats, and actions', () => {
    render(
      <ProfileMasthead
        actions={<button type="button">Follow</button>}
        handle="@hamza"
        location="Rabat"
        name="Hamza"
        stats={[{ label: 'films', value: 284 }]}
        status="online"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Hamza' })).toBeInTheDocument()
    expect(screen.getByText('@hamza · Rabat')).toBeInTheDocument()
    expect(screen.getByText('284')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })

  it('clamps and labels compatibility', () => {
    render(<CompatibilityPanel memberName="Yasmine" reason="Shared mysteries" score={120} />)

    expect(screen.getByLabelText('Taste compatibility with Yasmine')).toHaveTextContent('100%')
  })

  it('renders diary and taste evidence', () => {
    render(
      <>
        <DiaryRow date="26 Aug" href="/atlas" note="Still hurts" title="Atlas Motel" />
        <TasteSignature statement="Restless futures. Quiet dread." worlds={[{ label: 'Mystery', tone: 'lilac' }]} />
      </>,
    )

    expect(screen.getByRole('link', { name: 'Atlas Motel' })).toHaveAttribute('href', '/atlas')
    expect(screen.getByText('“Still hurts”')).toBeInTheDocument()
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })
})
