import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PreferenceRow, SettingsRail, SettingsSection } from './settings'

describe('settings and support components', () => {
  it('marks the current settings destination', () => {
    render(<SettingsRail activeHref="#profile" items={[{ href: '#account', label: 'Account' }, { href: '#profile', label: 'Profile' }]} />)

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
  })

  it('composes settings content and controls', () => {
    render(
      <SettingsSection title="Privacy & social">
        <PreferenceRow control={<button type="button">Change</button>} label="Profile visibility" />
      </SettingsSection>,
    )

    expect(screen.getByRole('heading', { name: 'Privacy & social' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })
})
