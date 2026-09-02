import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  EditorialFeature,
  MoodSelector,
  SectionHeading,
  SocialProof,
} from './editorial'

describe('editorial components', () => {
  it('keeps section and feature hierarchy semantic', () => {
    render(
      <>
        <SectionHeading
          description="What people you trust are loving tonight."
          title="From your circle"
        />
        <EditorialFeature
          alt="A Place Between Signals artwork"
          context="A Consumit editorial pick"
          synopsis="A linguist receives one message from a future that never happened."
          title="A Place Between Signals"
        />
      </>,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'From your circle' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'A Place Between Signals',
      }),
    ).toBeInTheDocument()
  })

  it('requests a mood selection and marks the active value', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <MoodSelector
        label="Choose tonight's mood"
        onValueChange={onValueChange}
        options={[
          { label: 'Slow & beautiful', tone: 'orange', value: 'slow' },
          { label: 'Easy comfort', tone: 'lime', value: 'comfort' },
        ]}
        value="slow"
      />,
    )

    const selectedMood = screen.getByRole('button', { name: 'Slow & beautiful' })
    expect(selectedMood).toHaveAttribute('aria-pressed', 'true')
    expect(selectedMood).toHaveClass('hover:text-canvas')
    expect(selectedMood).not.toHaveClass('hover:text-ink')
    await user.click(screen.getByRole('button', { name: 'Easy comfort' }))
    expect(onValueChange).toHaveBeenCalledWith('comfort')
  })

  it('summarizes social proof through a named avatar group', () => {
    render(
      <SocialProof
        items={[{ name: 'Yasmine' }, { name: 'Omar' }]}
        label="Yasmine and Omar"
        text="2 friends loved it"
      />,
    )

    expect(screen.getByRole('img', { name: 'Yasmine and Omar' })).toBeInTheDocument()
    expect(screen.getByText('2 friends loved it')).toBeInTheDocument()
  })
})
