import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PreferenceRow, SettingsFact, SettingsRail, SettingsSection } from './settings'

describe('settings and support components', () => {
  it('marks the current settings destination', () => {
    render(<SettingsRail activeHref="#profile" items={[{ href: '#account', label: 'Account' }, { href: '#profile', label: 'Profile', index: '02' }]} />)

    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveTextContent('02')
  })

  it('composes settings content and controls', () => {
    render(
      <SettingsSection index="03" title="Privacy & social">
        <PreferenceRow control={<button type="button">Change</button>} label="Profile visibility" />
      </SettingsSection>,
    )

    expect(screen.getByRole('heading', { name: 'Privacy & social' })).toHaveTextContent('03')
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('states a fact with its lead-in without offering a control', () => {
    render(<SettingsFact lead="Private by default.">Nothing is shared outside your account.</SettingsFact>)

    const fact = document.querySelector('[data-consumit-settings-fact]')
    expect(fact).not.toBeNull()
    expect(fact?.textContent).toContain('Private by default.')
    expect(fact?.textContent).toContain('Nothing is shared outside your account.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
