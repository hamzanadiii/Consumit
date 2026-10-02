'use client'

import { buttonVariants, Input, Label, Select, type SelectionOption } from '@consumit/ui'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'

import { SupportShell } from '../support/support-shell'
import { buildIssueMailto, MAX_ISSUE_DESCRIPTION_LENGTH, normalizeSupportEmail, parseIssueCategory, type IssueCategory } from './issue-report'

const categoryOptions: readonly SelectionOption[] = [
  { label: 'Playback', value: 'playback' },
  { label: 'Account', value: 'account' },
  { label: 'Catalog or metadata', value: 'catalog' },
  { label: 'Something else', value: 'other' },
]

function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">{children}</p>
}

export function ReportIssueScreen({ category, supportEmail }: { category: IssueCategory; supportEmail: string | undefined }) {
  const recipient = useMemo(() => normalizeSupportEmail(supportEmail), [supportEmail])
  const [issueCategory, setIssueCategory] = useState<IssueCategory>(category)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const mailto = useMemo(() => {
    if (!recipient || title.trim().length < 4 || description.trim().length < 10) return null
    if (replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim())) return null
    return buildIssueMailto(recipient, { category: issueCategory, description, replyEmail, title })
  }, [description, issueCategory, recipient, replyEmail, title])

  function updateField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <SupportShell>
      <main className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(15rem,0.7fr)] md:gap-16">
        <div>
          <a className="inline-flex min-h-11 items-center rounded-control text-xs font-bold text-[var(--fs-secondary)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/help">← Help center</a>
          <h1 className="mt-8 font-display text-4xl leading-[1.02] tracking-[-0.035em] sm:text-5xl">Tell us what got in the way.</h1>
          <p className="mt-4 max-w-[60ch] text-sm leading-6 text-[var(--fs-secondary)]">Share what you expected and what happened. Leave out passwords, payment details, and private browsing information.</p>

          {recipient ? (
            <form className="mt-9 flex flex-col gap-6" onSubmit={updateField}>
              <Select hideLabel id="issue-category" label="Issue category" name="category" onValueChange={(value) => setIssueCategory(parseIssueCategory(value))} options={categoryOptions} value={issueCategory} />

              <div>
                <Label htmlFor="issue-title">Short summary</Label>
                <Input autoComplete="off" className="mt-2 w-full" id="issue-title" maxLength={120} minLength={4} name="title" onChange={(event) => setTitle(event.currentTarget.value)} placeholder="For example, episode will not start" required value={title} />
                <FieldHint>At least 4 characters.</FieldHint>
              </div>

              <div>
                <Label htmlFor="issue-description">What happened?</Label>
                <textarea aria-describedby="issue-description-hint" className="mt-2 min-h-40 w-full resize-y rounded-control border border-control-outline bg-field px-4 py-3 text-sm leading-6 text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange/30 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas aria-[invalid=true]:border-danger motion-reduce:transition-none" id="issue-description" maxLength={MAX_ISSUE_DESCRIPTION_LENGTH} minLength={10} name="description" onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Include the title or episode, what you were doing, and any message Consumit showed." required value={description} />
                <FieldHint><span id="issue-description-hint">10 to {MAX_ISSUE_DESCRIPTION_LENGTH.toLocaleString('en-US')} characters. No passwords, payment details, or private browsing data.</span></FieldHint>
              </div>

              <div>
                <Label htmlFor="issue-reply-email">Reply email <span className="font-normal normal-case tracking-normal text-[var(--fs-muted)]">(optional)</span></Label>
                <Input aria-describedby="issue-reply-email-hint" aria-invalid={replyEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim()) || undefined} autoComplete="email" className="mt-2 w-full" id="issue-reply-email" maxLength={254} name="replyEmail" onChange={(event) => setReplyEmail(event.currentTarget.value)} placeholder="you@example.com" type="email" value={replyEmail} />
                <FieldHint><span id="issue-reply-email-hint">{replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim()) ? 'Enter a valid email address or clear this field.' : 'This address and your report are added to an email draft on your device.'}</span></FieldHint>
              </div>

              <div className="flex flex-wrap items-center gap-4 border-t border-[var(--fs-line)] pt-5">
                {mailto ? (
                  <a className={buttonVariants({ size: 'lg', variant: 'accent' })} href={mailto}>Prepare email</a>
                ) : (
                  <span aria-disabled="true" className={`${buttonVariants({ size: 'lg', variant: 'accent' })} cursor-not-allowed opacity-45`}>Prepare email</span>
                )}
                <p className="max-w-[42ch] text-xs leading-5 text-[var(--fs-muted)]">Your email app opens with this draft. Review it and send it there.</p>
              </div>
            </form>
          ) : (
            <section aria-labelledby="report-unavailable" className="mt-9 border-y border-[var(--fs-line)] py-6" role="status">
              <h2 className="font-display text-2xl tracking-[-0.02em]" id="report-unavailable">Issue reporting is unavailable</h2>
              <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[var(--fs-secondary)]">Consumit does not have a support email configured for this site, so a report cannot be received here yet. Visit the Help Center for account and playback guidance.</p>
              <a className="mt-4 inline-flex min-h-11 items-center rounded-control px-1 text-xs font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/help">Go to Help Center</a>
            </section>
          )}
        </div>

        <aside className="h-fit border-t border-[var(--fs-line)] pt-5 md:mt-[3.4rem] md:border-t-0 md:border-l md:pt-0 md:pl-7">
          <h2 className="font-display text-xl tracking-[-0.02em]">A useful report includes</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--fs-secondary)]">
            <li>What you expected to happen</li>
            <li>What happened instead</li>
            <li>The movie, series, or anime episode involved</li>
            <li>Any plain-language error shown by Consumit</li>
          </ul>
          <p className="mt-6 border-t border-[var(--fs-line)] pt-4 text-xs leading-5 text-[var(--fs-muted)]">The report form does not attach your watch history, provider details, or page activity.</p>
        </aside>
      </main>
    </SupportShell>
  )
}
