import type { ReactNode } from 'react'

import { FilScreenShell } from '../home/filscreen-shell'

export const LEGAL_LAST_UPDATED = 'October 7, 2026'

export function LegalLink({ children, href }: { children: ReactNode; href: string }) {
  return <a className="font-bold text-orange underline decoration-orange/50 underline-offset-4 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={href}>{children}</a>
}

export function LegalNotice({ children }: { children: ReactNode }) {
  return <p className="border-l-[3px] border-orange pl-5 text-base font-semibold leading-7 text-ink">{children}</p>
}

type LegalDocumentProps = {
  children: ReactNode
  intro: ReactNode
  title: string
}

export function LegalDocument({ children, intro, title }: LegalDocumentProps) {
  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto min-h-[70vh] w-full max-w-4xl py-10 sm:py-14" data-consumit-legal-document>
        <header className="text-center">
          <h1 className="text-balance font-display text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95] tracking-[-0.025em] text-ink">{title}</h1>
          <p className="mt-5 text-sm text-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
        </header>
        <div className="mt-12 max-w-[74ch] text-base leading-7 text-copy">{intro}</div>
        <div className="mt-12 space-y-11">{children}</div>
      </main>
    </FilScreenShell>
  )
}

type LegalSectionProps = {
  children: ReactNode
  id: string
  number: number
  title: string
}

export function LegalSection({ children, id, number, title }: LegalSectionProps) {
  return (
    <section aria-labelledby={id}>
      <h2 className="font-display text-2xl leading-tight tracking-[-0.01em] text-ink sm:text-[1.75rem]" id={id}>{number}. {title}</h2>
      <div className="mt-4 max-w-[74ch] space-y-4 text-[15px] leading-7 text-copy">{children}</div>
    </section>
  )
}
