import type { Metadata } from 'next'

import { parseIssueCategory } from './issue-report'
import { ReportIssueScreen } from './report-issue-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Report an issue · Consumit',
  description: 'Report a problem with playback, your account, or Consumit catalog details.',
  robots: { follow: false, index: false },
}

export default async function ReportIssuePage({ searchParams }: { searchParams: Promise<{ category?: string | string[] }> }) {
  const { category } = await searchParams
  return <ReportIssueScreen category={parseIssueCategory(category)} supportEmail={process.env.SUPPORT_EMAIL} />
}
