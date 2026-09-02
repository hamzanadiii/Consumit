import { ArrowRight, Play, Plus, Trash2 } from 'lucide-react'

import { Button } from '@consumit/ui'

const variantNames = [
  'Primary',
  'Accent',
  'Secondary',
  'Ghost',
  'Danger',
] as const

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[90rem] px-5 py-12 sm:px-8 lg:px-[62px] lg:py-20">
      <header className="max-w-[48rem]">
        <div aria-hidden="true" className="mb-8 h-px w-24 bg-orange" />
        <h1 className="text-balance font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.025em] text-ink">
          Shared interface
        </h1>
        <p className="mt-6 max-w-[68ch] text-pretty text-base leading-7 text-copy sm:text-lg sm:leading-8">
          Consumit’s reusable modules begin with one deliberate control. The
          button establishes action hierarchy, icon rhythm, focus treatment,
          loading behavior, and the compact geometry used across the product.
        </p>
      </header>

      <section className="mt-16 border-t border-border py-10 lg:mt-24 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
        <div>
          <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">
            Action hierarchy
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Five roles, each with a distinct consequence.
          </p>
        </div>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-0">
          {variantNames.map((name) => (
            <div className="border-b border-border pb-8" key={name}>
              <p className="mb-4 text-xs uppercase tracking-[0.12em] text-muted">
                {name}
              </p>
              {name === 'Primary' ? (
                <Button>
                  <Play aria-hidden="true" />
                  Play now
                </Button>
              ) : null}
              {name === 'Secondary' ? (
                <Button variant="secondary">
                  <Plus aria-hidden="true" />
                  Save to library
                </Button>
              ) : null}
              {name === 'Accent' ? (
                <Button variant="accent">Create account</Button>
              ) : null}
              {name === 'Ghost' ? (
                <Button variant="ghost">
                  View details
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : null}
              {name === 'Danger' ? (
                <Button variant="danger">
                  <Trash2 aria-hidden="true" />
                  Delete list
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
        <div>
          <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">
            Scale and state
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Touch-safe sizing and honest feedback for unavailable work.
          </p>
        </div>

        <div className="mt-8 space-y-10 lg:mt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small action</Button>
            <Button size="md">Default action</Button>
            <Button size="lg">Large action</Button>
            <Button aria-label="Add title" size="icon" variant="secondary">
              <Plus aria-hidden="true" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button loading>Switching source…</Button>
            <Button disabled variant="secondary">
              Unavailable
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
