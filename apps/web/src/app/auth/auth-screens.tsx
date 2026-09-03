'use client'

import { Check, Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  AuthField,
  AuthShell,
  AvatarGroup,
  Button,
  SocialAuthButton,
  TrustNote,
} from '@consumit/ui'

const circleMembers = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
] as const

function AuthBrand({ className = '' }: { className?: string }) {
  return (
    <Link
      aria-label="Consumit home"
      className={`inline-flex min-h-11 items-center gap-3 rounded-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange ${className}`}
      href="/"
    >
      <Image alt="" className="size-8 mix-blend-screen" height={32} src="/assets/consumit-mark.svg" width={32} />
      <span className="text-[0.93rem] font-bold tracking-[0.2em]">CONSUMIT</span>
    </Link>
  )
}

function AuthEyebrow({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-copy">
      <span aria-hidden="true" className="h-0.5 w-6 bg-orange" />
      {children}
    </p>
  )
}

function AuthDivider() {
  return (
    <div aria-label="or" className="flex items-center gap-5" role="separator">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className="text-[0.625rem] uppercase text-muted">or</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  )
}

function SignInStoryProof() {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-canvas/75 p-4 backdrop-blur-sm">
      <AvatarGroup items={circleMembers} label="Yasmine, Omar, and Nadia" />
      <div className="min-w-0">
        <p className="text-xs font-bold text-ink">Your circle kept watching.</p>
        <p className="mt-1 text-[0.6875rem] leading-5 text-muted">
          6 new reviews and 23 saved titles since your last visit.
        </p>
      </div>
    </div>
  )
}

function PosterFan() {
  return (
    <div aria-hidden="true" className="relative mt-12 h-[25rem] w-full max-w-[36rem]">
      <Image
        alt=""
        className="absolute top-5 left-7 h-[23rem] w-[15.5rem] -rotate-[7deg] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/35"
        height={368}
        src="/assets/posters/northbound.svg"
        width={248}
      />
      <Image
        alt=""
        className="absolute top-10 left-[12.5rem] h-[23.5rem] w-[16rem] rotate-[4deg] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/40"
        height={376}
        src="/assets/posters/violet-hours.svg"
        width={256}
      />
      <Image
        alt=""
        className="absolute top-20 right-1 h-[21rem] w-[14rem] rotate-[10deg] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/45"
        height={336}
        src="/assets/posters/saltwater.svg"
        width={224}
      />
    </div>
  )
}

export function SignInScreen() {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <AuthShell
      artworkClassName="object-[78%_center]"
      artworkSrc="/assets/cinematic-backdrop.svg"
      asideClassName="lg:p-[62px]"
      asideContent={<SignInStoryProof />}
      asideDescription="Return to the films, people, and lists that know what your next night should feel like."
      asideEyebrow={<AuthEyebrow>Your taste space</AuthEyebrow>}
      asideTitle="Your taste is waiting."
      className="min-h-screen rounded-none border-0 lg:grid-cols-[54.86%_45.14%]"
      contentClassName="bg-field"
      contentHeader={(
        <>
          <AuthBrand className="lg:hidden" />
          <Link
            className="ml-auto inline-flex min-h-11 items-center rounded-control text-xs text-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none"
            href="/help"
            prefetch={false}
          >
            Need help?
          </Link>
        </>
      )}
      description="Sign in to continue your library and circle."
      footer={(
        <p>
          By continuing, you agree to Consumit&apos;s{' '}
          <Link className="relative rounded-micro text-copy underline decoration-border underline-offset-4 outline-none after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/terms" prefetch={false}>Terms</Link>
          {' '}and{' '}
          <Link className="relative rounded-micro text-copy underline decoration-border underline-offset-4 outline-none after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/privacy" prefetch={false}>Privacy Policy</Link>.
        </p>
      )}
      formClassName="lg:max-w-[26.875rem]"
      header={<AuthBrand />}
      title="Welcome back."
    >
      <div className="space-y-7">
        <div className="space-y-3">
          <SocialAuthButton
            className="uppercase tracking-[0.04em]"
            label="Continue with Google"
            provider="Google"
            tone="light"
          />
          <SocialAuthButton
            className="uppercase tracking-[0.04em]"
            label="Continue with Apple"
            provider="Apple"
          />
        </div>

        <AuthDivider />

        <form action="/api/auth/sign-in" className="space-y-5" method="post">
          <AuthField
            autoComplete="email"
            defaultValue="hamza@example.com"
            id="sign-in-email"
            label="Email"
            name="email"
            required
            type="email"
          />
          <AuthField
            action={(
              <Link
                className="inline-flex min-h-11 items-center font-bold uppercase tracking-[0.05em] text-orange outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
                href="/forgot-password"
                prefetch={false}
              >
                Forgot password?
              </Link>
            )}
            autoComplete="current-password"
            defaultValue="nightwatch"
            id="sign-in-password"
            label="Password"
            name="password"
            required
            trailingAction={(
              <Button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-muted hover:text-ink"
                onClick={() => setShowPassword((current) => !current)}
                size="icon"
                variant="ghost"
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            )}
            type={showPassword ? 'text' : 'password'}
          />
          <Button className="w-full text-xs font-bold uppercase tracking-[0.05em]" size="lg" type="submit" variant="accent">
            Sign in
          </Button>
        </form>

        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          New to Consumit?
          <Link className="inline-flex min-h-11 items-center font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href="/sign-up">
            Create your taste space
          </Link>
        </p>

        <TrustNote title="Your library stays private by default." tone="lime">
          You decide what appears on your public profile.
        </TrustNote>
      </div>
    </AuthShell>
  )
}

export function SignUpScreen() {
  return (
    <AuthShell
      asideClassName="bg-[linear-gradient(145deg,#17131a_0%,#3b2531_48%,#765064_76%,#17151d_100%)] lg:px-[62px] lg:pt-[42px] lg:pb-[145px]"
      asideDescription="Build a library, remember every watch, and discover through people whose taste actually means something to you."
      asideEyebrow={<AuthEyebrow>A profile with a pulse</AuthEyebrow>}
      asideTitle="Keep what you love. Find who gets it."
      className="min-h-screen rounded-none border-0 lg:grid-cols-[54.86%_45.14%]"
      contentClassName="bg-field lg:py-10"
      contentHeader={(
        <>
          <AuthBrand className="lg:hidden" />
          <p className="ml-auto flex min-h-11 flex-wrap items-center justify-end gap-x-2 text-xs text-muted">
            Already a member?
            <Link className="inline-flex min-h-11 items-center font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href="/sign-in">
              Sign in
            </Link>
          </p>
        </>
      )}
      description="The useful setup takes about two minutes and can be skipped."
      footer={(
        <p className="flex flex-wrap items-center gap-x-3">
          Already have an account?
          <Link className="inline-flex min-h-11 items-center font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href="/sign-in">
            Sign in
          </Link>
        </p>
      )}
      formClassName="lg:max-w-[26.875rem]"
      header={(
        <div>
          <AuthBrand />
          <PosterFan />
        </div>
      )}
      title="Create your taste space."
      titleClassName="lg:whitespace-nowrap lg:text-[2.625rem]"
    >
      <div className="space-y-5">
        <SocialAuthButton
          className="uppercase tracking-[0.04em]"
          label="Sign up with Google"
          provider="Google"
          tone="light"
        />

        <AuthDivider />

        <form action="/api/auth/sign-up" className="space-y-3" method="post">
          <AuthField
            autoComplete="name"
            id="sign-up-name"
            label="Display name"
            name="displayName"
            placeholder="What should people call you?"
            required
            type="text"
          />
          <AuthField
            autoComplete="email"
            id="sign-up-email"
            label="Email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
          <div>
            <AuthField
              autoComplete="new-password"
              id="sign-up-password"
              label="Password"
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type="password"
            />
            <div aria-hidden="true" className="mt-3 h-1 bg-surface-raised">
              <span className="block h-full w-0 bg-orange" />
            </div>
            <p className="mt-2 text-[0.6875rem] leading-5 text-muted">
              Use 8+ characters. A password manager is even better.
            </p>
          </div>

          <div className="relative flex min-h-11 items-center gap-3">
            <input
              className="peer absolute left-0 size-11 cursor-pointer opacity-0"
              defaultChecked
              id="account-terms"
              name="termsAccepted"
              required
              type="checkbox"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none grid size-4 shrink-0 place-items-center rounded-micro border border-control-outline bg-surface text-canvas peer-checked:border-orange peer-checked:bg-orange peer-focus-visible:ring-2 peer-focus-visible:ring-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas [&_svg]:size-3 [&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100"
            >
              <Check />
            </span>
            <p className="text-[0.6875rem] leading-5 text-muted">
              <label className="cursor-pointer" htmlFor="account-terms">I agree to the </label>
              <Link className="relative rounded-micro text-copy underline decoration-border underline-offset-4 outline-none after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/terms" prefetch={false}>Terms</Link>
              {' '}and{' '}
              <Link className="relative rounded-micro text-copy underline decoration-border underline-offset-4 outline-none after:absolute after:-inset-x-1 after:-inset-y-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/privacy" prefetch={false}>Privacy Policy</Link>.
            </p>
          </div>

          <Button className="w-full text-xs font-bold uppercase tracking-[0.05em]" size="lg" type="submit" variant="accent">
            Create account
          </Button>
        </form>

        <TrustNote title="You stay in control." tone="lilac">
          <p>Onboarding is optional. Your public profile starts private.</p>
          <p className="mt-1">Imports can be deleted without deleting your account.</p>
        </TrustNote>
      </div>
    </AuthShell>
  )
}
