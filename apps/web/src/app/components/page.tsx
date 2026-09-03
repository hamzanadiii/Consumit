import { ArrowRight, Play, Plus, Trash2 } from 'lucide-react'

import { Button, GlobalNavigation, Input, Label } from '@consumit/ui'

import { ComponentFamiliesCatalog } from '../catalog/component-families'
import { ComponentFamiliesCatalog1118 } from '../catalog/component-families-11-18'

const variantNames = [
  'Primary',
  'Accent',
  'Secondary',
  'Ghost',
  'Danger',
] as const

const navigationBehaviors = [
  ['Desktop', '84px shell with persistent routes and universal search'],
  ['Mobile', '64px brand-and-menu bar with search inside the drawer'],
  ['Current route', 'Orange signal line and semantic page announcement'],
  ['Member', 'Profile shortcut with a lime presence signal'],
] as const

export default function ComponentsPage() {
  return (
    <>
      <GlobalNavigation
        activeHref="/"
        avatarSrc="/assets/hamza-avatar.svg"
        profileName="Hamza"
        sticky={false}
      />

      <main className="mx-auto min-h-screen w-full max-w-[90rem] px-5 py-12 sm:px-8 lg:px-[62px] lg:py-20">
        <header className="max-w-[48rem]">
          <div aria-hidden="true" className="mb-8 h-px w-24 bg-orange" />
          <p className="mb-4 text-xs uppercase tracking-[0.14em] text-muted">
            Consumit interface system
          </p>
          <h1 className="text-balance font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.025em] text-ink">
            Shared interface
          </h1>
          <p className="mt-6 max-w-[68ch] text-pretty text-base leading-7 text-copy sm:text-lg sm:leading-8">
            Consumit&apos;s reusable language now spans the complete supplied
            screen set—from action and wayfinding through identity, titles,
            libraries, onboarding, settings, playback, and resilient global
            states. Each component is built from the active screens, then
            tested as a durable product primitive.
          </p>
        </header>

        <ComponentFamiliesCatalog1118 />

        <ComponentFamiliesCatalog />

        <section className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
          <div>
            <h2 className="font-display text-2xl tracking-[-0.02em] text-ink">
              Label + input{' '}
              <span className="font-interface text-xs font-bold tracking-[0.12em] text-orange">
                03.1
              </span>
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Persistent context and a quiet 52px field across empty, filled,
              invalid, and unavailable states.
            </p>
          </div>

          <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:mt-0">
            <div className="border-b border-border pb-8">
              <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
                Empty
              </p>
              <div className="max-w-[27rem]">
                <Label htmlFor="catalog-display-name">Display name</Label>
                <Input
                  className="mt-2"
                  id="catalog-display-name"
                  placeholder="What should people call you?"
                />
              </div>
            </div>

            <div className="border-b border-border pb-8">
              <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
                Populated
              </p>
              <div className="max-w-[27rem]">
                <Label htmlFor="catalog-email">Email</Label>
                <Input
                  autoComplete="email"
                  className="mt-2"
                  defaultValue="hamza@example.com"
                  id="catalog-email"
                  type="email"
                />
              </div>
            </div>

            <div className="border-b border-border pb-8">
              <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
                Read-only
              </p>
              <div className="max-w-[27rem]">
                <Label htmlFor="catalog-location">Location</Label>
                <Input
                  className="mt-2"
                  defaultValue="Rabat, Morocco"
                  id="catalog-location"
                  readOnly
                />
              </div>
            </div>

            <div className="border-b border-border pb-8">
              <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
                Invalid
              </p>
              <div className="max-w-[27rem]">
                <Label htmlFor="catalog-username">Username</Label>
                <Input
                  aria-describedby="catalog-username-error"
                  aria-invalid="true"
                  className="mt-2"
                  defaultValue="ham za"
                  id="catalog-username"
                />
                <p
                  className="mt-2 text-xs leading-5 text-copy"
                  id="catalog-username-error"
                >
                  Use letters, numbers, or underscores—no spaces.
                </p>
              </div>
            </div>

            <div className="border-b border-border pb-8">
              <p className="mb-5 text-xs uppercase tracking-[0.12em] text-muted">
                Disabled
              </p>
              <div className="max-w-[27rem]">
                <Label className="text-muted" htmlFor="catalog-service">
                  Imported account
                </Label>
                <Input
                  className="mt-2"
                  defaultValue="Netflix"
                  disabled
                  id="catalog-service"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-orange">
              Component 02
            </p>
            <h2 className="mt-3 font-display text-2xl tracking-[-0.02em] text-ink">
              Global navigation
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              The live specimen is anchoring this page. Resize below 1024px to
              inspect its separate mobile composition.
            </p>
          </div>

          <div className="mt-8 border-t border-border lg:mt-0">
            {navigationBehaviors.map(([label, detail]) => (
              <div
                className="grid gap-2 border-b border-border py-5 sm:grid-cols-[9rem_1fr] sm:items-baseline"
                key={label}
              >
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink">
                  {label}
                </p>
                <p className="text-sm leading-6 text-copy">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-10 lg:grid lg:grid-cols-[16rem_1fr] lg:gap-12">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Component 01
            </p>
            <h2 className="mt-3 font-display text-2xl tracking-[-0.02em] text-ink">
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
              <Button loading>Switching source&hellip;</Button>
              <Button disabled variant="secondary">
                Unavailable
              </Button>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
