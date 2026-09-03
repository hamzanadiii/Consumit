import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  CompatibilityPanel,
  DiaryRow,
  ProfileMasthead,
  ProfileReviewCard,
  RatingRhythm,
  TasteSignature,
} from './profile'

describe('profile components', () => {
  it('renders profile identity, context, stats, and actions', () => {
    const { container } = render(
      <ProfileMasthead
        actions={<button type="button">Follow</button>}
        avatarClassName="lg:size-36"
        contentClassName="lg:inset-x-[62px]"
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
    expect(screen.getByRole('img', { name: 'Hamza, online' })).toHaveClass('lg:size-36')
    expect(
      container.querySelector('[data-consumit-profile-masthead] > div'),
    ).toHaveClass('lg:inset-x-[62px]')
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
    expect(screen.getByRole('link', { name: 'Atlas Motel' })).toHaveClass('min-h-11')
    expect(screen.getByText('“Still hurts”')).toBeInTheDocument()
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })

  it('renders profile review and rating-distribution evidence', () => {
    render(
      <>
        <ProfileReviewCard
          excerpt="Some movies explain loneliness."
          href="/reviews/atlas-motel"
          likes="73"
          rating={5}
          reviewedOn="26 August"
          title="Atlas Motel"
        />
        <RatingRhythm values={[4, 8, 14, 22, 29, 19, 11, 6]} />
      </>,
    )

    expect(screen.getByRole('link', { name: 'Atlas Motel' })).toHaveClass('min-h-11')
    expect(screen.getByText('Reviewed 26 August · 73 likes')).toBeInTheDocument()
    expect(screen.getByLabelText('Rating rhythm: 4, 8, 14, 22, 29, 19, 11, 6')).toBeInTheDocument()
    expect(screen.getByText('½').parentElement).toHaveClass('text-muted')
  })
})
