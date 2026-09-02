import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dropzone, HealthSummary, PreferenceRow, SettingsRail, SettingsSection } from './settings'

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

  it('renders textual health and a native file input', () => {
    render(
      <>
        <HealthSummary entries={[{ label: 'Recommended source', status: 'healthy' }, { label: 'Backup source', status: 'slow' }]} />
        <Dropzone description="PNG or MP4" title="Add screenshot" />
      </>,
    )

    expect(screen.getByText('healthy')).toBeInTheDocument()
    expect(screen.getByText('slow').parentElement?.querySelector('span')).toHaveClass('bg-copy')
    expect(screen.getByLabelText(/Add screenshot/)).toHaveAttribute('type', 'file')
  })
})
