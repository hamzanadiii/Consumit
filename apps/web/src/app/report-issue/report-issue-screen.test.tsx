import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { buildIssueMailto, normalizeSupportEmail, parseIssueCategory } from './issue-report'
import { ReportIssueScreen } from './report-issue-screen'

describe('issue report destination and draft', () => {
  it('rejects malformed or missing public inbox addresses', () => {
    expect(normalizeSupportEmail(undefined)).toBeNull()
    expect(normalizeSupportEmail('support@')).toBeNull()
    expect(normalizeSupportEmail('support@example.com\r\nBcc: stranger@example.com')).toBeNull()
    expect(normalizeSupportEmail(' support@example.com ')).toBe('support@example.com')
  })

  it('accepts only known issue categories from the route', () => {
    expect(parseIssueCategory('playback')).toBe('playback')
    expect(parseIssueCategory(['account', 'playback'])).toBe('account')
    expect(parseIssueCategory('unknown')).toBe('other')
  })

  it('keeps the report unavailable when no inbox is configured', () => {
    render(<ReportIssueScreen category="playback" supportEmail={undefined} />)

    expect(screen.getByRole('status')).toHaveTextContent('Consumit does not have a support email configured')
    expect(screen.queryByRole('link', { name: 'Prepare email' })).not.toBeInTheDocument()
  })

  it('builds an email draft with only the details the member entered', async () => {
    const user = userEvent.setup()
    render(<ReportIssueScreen category="playback" supportEmail="support@example.com" />)

    expect(screen.queryByRole('link', { name: 'Prepare email' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Short summary' }), 'Episode does not start')
    await user.type(screen.getByRole('textbox', { name: 'What happened?' }), 'The episode stays on the loading screen after I press play.')
    await user.type(screen.getByRole('textbox', { name: /Reply email/ }), 'member@example.com')

    const draft = screen.getByRole('link', { name: 'Prepare email' })
    const query = new URLSearchParams(draft.getAttribute('href')?.split('?')[1])
    expect(draft).toHaveAttribute('href', expect.stringContaining('mailto:support@example.com?'))
    expect(query.get('subject')).toBe('[Consumit] Playback: Episode does not start')
    expect(query.get('body')).toContain('Category: Playback')
    expect(query.get('body')).toContain('Reply email: member@example.com')
    expect(query.get('body')).toContain('The episode stays on the loading screen after I press play.')
    expect(query.get('body')).not.toContain('page activity')
  })

  it('encodes a draft as a mailto URL without adding browser or account context', () => {
    const url = buildIssueMailto('support@example.com', {
      category: 'other',
      description: 'A title page failed to load.',
      replyEmail: '',
      title: 'Title page failed',
    })

    expect(url).toContain('mailto:support@example.com?')
    expect(new URLSearchParams(url.split('?')[1]).get('body')).toBe('Category: Something else\nReply email: Not provided\n\nA title page failed to load.')
    expect(url).not.toContain('window.location')
  })
})
