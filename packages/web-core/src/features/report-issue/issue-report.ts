export const ISSUE_CATEGORIES = ['playback', 'account', 'catalog', 'other'] as const
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]
export const MAX_ISSUE_DESCRIPTION_LENGTH = 1000

const categoryLabels: Record<IssueCategory, string> = {
  account: 'Account',
  catalog: 'Catalog or metadata',
  other: 'Something else',
  playback: 'Playback',
}

export function parseIssueCategory(value: string | string[] | undefined): IssueCategory {
  const first = Array.isArray(value) ? value[0] : value
  return ISSUE_CATEGORIES.includes(first as IssueCategory) ? first as IssueCategory : 'other'
}

export function normalizeSupportEmail(value: string | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate || candidate.length > 254 || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(candidate)) return null
  return candidate
}

export function buildIssueMailto(recipient: string, input: { category: IssueCategory; description: string; replyEmail: string; title: string }): string {
  const subject = `[Consumit] ${categoryLabels[input.category]}: ${input.title.trim().slice(0, 120)}`
  const body = [
    `Category: ${categoryLabels[input.category]}`,
    `Reply email: ${input.replyEmail.trim() || 'Not provided'}`,
    '',
    input.description.trim(),
  ].join('\n')
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
