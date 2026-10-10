import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { SupportShell } from '../support/support-shell'
import { communityLinks } from '@/lib/community'

export const metadata: Metadata = {
  title: 'Help Center · Consumit',
  description: 'Answers about watching, your library, your profile, and your account on Consumit.',
  robots: { follow: true, index: true },
}

type HelpQuestion = { answer: ReactNode; question: string }
type HelpGroup = { label: string; questions: readonly HelpQuestion[] }

const groups: readonly HelpGroup[] = [
  {
    label: 'Watching',
    questions: [
      {
        question: 'Why can I find a title but not play it?',
        answer: <>Catalog details and playback availability are separate. The Consumit Player can play a title only when a configured source is available. It will not replace a missing source with a trailer or another site’s player.</>,
      },
      {
        question: 'What should I do if playback stops?',
        answer: <>Consumit tries to recover playback when a usable alternative is available. Your watch progress belongs to the title or episode, so changing a playback source does not create a separate history entry. If the problem continues, <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4" href="/report-issue?category=playback">report a playback issue</Link>.</>,
      },
      {
        question: 'What do movies, series, and anime metadata come from?',
        answer: <>Movie and series catalog details come from TMDB. Anime catalog details come from AniList. A catalog entry does not by itself mean a playback source is available.</>,
      },
    ],
  },
  {
    label: 'Your library',
    questions: [
      {
        question: 'Where do my watches, reviews, and lists appear?',
        answer: <>Your profile brings together saved titles, watch history, reviews, Favorites, and lists. Open Watchlist or History there for your private records. Member records support movies, series, and anime. Reviews and lists keep their own visibility and ownership settings.</>,
      },
      {
        question: 'How do I control who can see my profile?',
        answer: <>Open <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4" href="/settings">Settings</Link> to change your profile visibility. Your public profile details stay separate from your private account credentials.</>,
      },
    ],
  },
  {
    label: 'Your account',
    questions: [
      {
        question: 'I cannot sign in or verify my email. What now?',
        answer: <>Check that you are using the verified email for your account. You can <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4" href="/forgot-password">reset your password</Link>, <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4" href="/verify-email">request email verification</Link>, or return to <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4" href="/sign-in">sign in</Link>.</>,
      },
      {
        question: 'What should I include in an issue report?',
        answer: <>Tell us what you expected, what happened, and which title or episode was involved. Never include your password, payment details, or private browsing information. Use <Link className="font-bold text-[var(--fs-ink)] underline decoration-[var(--fs-accent)] underline-offset-4" href="/report-issue">Report an issue</Link> to prepare a message for Consumit support.</>,
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <SupportShell>
      <main className="mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <h1 className="mt-4 font-display text-4xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">A little help, when you need it.</h1>
          <p className="mt-5 max-w-[62ch] text-sm leading-6 text-[var(--fs-secondary)] sm:text-base sm:leading-7">Find answers about watching, keeping your library, and getting back into your account.</p>
          <Link className="mt-6 inline-flex min-h-11 items-center rounded-control border border-[var(--fs-field-border)] px-4 text-xs font-bold text-[var(--fs-ink)] outline-none transition-colors hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/report-issue">Report an issue</Link>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2"><Link className="inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4" href="/onboarding?next=%2Fhelp">Reopen the welcome guide</Link>{communityLinks.map(link => link.href ? <a className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href={link.href} key={link.name} target="_blank" rel="noopener noreferrer">Join {link.name}<span className="sr-only"> (opens in a new tab)</span></a> : null)}</div>
        </div>

        <div className="mt-12 grid gap-10 border-t border-[var(--fs-line)] pt-8 md:mt-16 md:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.8fr)] md:gap-16">
          <nav aria-label="Help topics" className="flex flex-wrap content-start gap-x-5 gap-y-1 md:flex-col md:gap-1">
            {groups.map((group, index) => (
              <a className="inline-flex min-h-11 items-center rounded-control text-sm text-[var(--fs-secondary)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`#help-topic-${index + 1}`} key={group.label}>{group.label}</a>
            ))}
          </nav>
          <div>
            {groups.map((group, index) => (
              <section aria-labelledby={`help-topic-heading-${index + 1}`} className="mb-10 scroll-mt-8 last:mb-0" id={`help-topic-${index + 1}`} key={group.label}>
                <h2 className="font-display text-2xl tracking-[-0.02em] sm:text-3xl" id={`help-topic-heading-${index + 1}`}>{group.label}</h2>
                <div className="mt-4 border-t border-[var(--fs-line)]">
                  {group.questions.map(({ answer, question }) => (
                    <details className="group border-b border-[var(--fs-line)]" key={question}>
                      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 py-3 text-sm font-bold text-[var(--fs-ink)] outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus)] sm:text-base">
                        <span>{question}</span>
                        <span aria-hidden="true" className="shrink-0 text-lg font-normal text-[var(--fs-accent)] transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                      </summary>
                      <div className="max-w-[68ch] pb-5 pr-8 text-sm leading-6 text-[var(--fs-secondary)]">{answer}</div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </SupportShell>
  )
}
