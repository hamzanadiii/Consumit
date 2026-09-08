'use client'

import type { CatalogTitleSummary } from '@consumit/contracts'
import { AuthField, AuthShell, Button, TrustNote } from '@consumit/ui'
import { Check, Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, type ReactNode, useState } from 'react'

import {
  confirmPasswordRecovery,
  getUsernameAvailability,
  IdentityApiError,
  loginMember,
  registerMember,
  requestEmailVerification,
  requestPasswordRecovery,
  verifyMemberEmail,
} from '@/lib/identity-browser'

import { useSession } from '../session/session'

function AuthBrand({ className = '' }: { className?: string }) {
  return (
    <Link aria-label="Consumit home" className={`inline-flex min-h-11 items-center gap-3 rounded-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange ${className}`} href="/">
      <Image alt="" className="size-8 mix-blend-screen" height={32} src="/assets/consumit-mark.svg" width={32} />
      <span className="text-[0.93rem] font-bold tracking-[0.2em]">CONSUMIT</span>
    </Link>
  )
}

function PosterFan({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  return (
    <div aria-hidden="true" className="relative mt-12 h-[25rem] w-full max-w-[36rem]">
      {titles.slice(0, 3).map((title, index) => title.posterUrl ? (
        <Image
          alt=""
          className="absolute h-[23rem] w-[15.5rem] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/35"
          height={368}
          key={`${title.kind}:${title.id}`}
          src={title.posterUrl}
          style={{ left: `${1.75 + index * 10.75}rem`, top: `${1.25 + index * 1.9}rem`, transform: `rotate(${-7 + index * 8}deg)`, zIndex: index }}
          width={248}
        />
      ) : null)}
    </div>
  )
}

function FormMessage({ error, message }: { error?: string | null; message?: string | null }) {
  if (error) return <p className="text-xs leading-5 text-danger" role="alert">{error}</p>
  if (message) return <p aria-live="polite" className="text-xs leading-5 text-lime">{message}</p>
  return null
}

function errorMessage(error: unknown) {
  return error instanceof IdentityApiError ? error.message : 'Something went wrong. Please try again.'
}

function AuthFrame({ children, description, title, titles = [] }: {
  children: ReactNode
  description: string
  title: string
  titles?: readonly CatalogTitleSummary[]
}) {
  return (
    <AuthShell
      asideClassName="bg-[linear-gradient(145deg,#17131a_0%,#3b2531_48%,#765064_76%,#17151d_100%)] lg:px-[62px] lg:pt-[42px] lg:pb-[145px]"
      asideDescription="Build a library, remember every watch, and discover through people whose taste means something to you."
      asideTitle="Keep what you love. Find who gets it."
      className="min-h-screen rounded-none border-0 lg:grid-cols-[54.86%_45.14%]"
      contentClassName="bg-field lg:py-10"
      contentHeader={<><AuthBrand className="lg:hidden" /><Link className="ml-auto inline-flex min-h-11 items-center text-xs text-muted hover:text-ink" href="/help">Need help?</Link></>}
      description={description}
      footer={<p>Your account and library are private by default.</p>}
      formClassName="lg:max-w-[26.875rem]"
      header={<div><AuthBrand />{titles.length ? <PosterFan titles={titles} /> : null}</div>}
      title={title}
    >
      {children}
    </AuthShell>
  )
}

export function SignInScreen({ nextPath = '/', titles = [] }: { nextPath?: string; titles?: readonly CatalogTitleSummary[] }) {
  const router = useRouter()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await loginMember({ email: String(data.get('email')), password: String(data.get('password')) })
      session.setMember(member)
      router.push(nextPath)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <AuthFrame description="Sign in to continue your library and circle." title="Welcome back." titles={titles}>
      <form className="space-y-5" method="post" onSubmit={submit}>
        <AuthField autoComplete="email" id="sign-in-email" label="Email" name="email" required type="email" />
        <AuthField
          action={<Link className="inline-flex min-h-11 items-center font-bold uppercase tracking-[0.05em] text-orange hover:text-ink" href="/forgot-password">Forgot password?</Link>}
          autoComplete="current-password"
          id="sign-in-password"
          label="Password"
          minLength={12}
          name="password"
          required
          trailingAction={<Button aria-label={showPassword ? 'Hide password' : 'Show password'} className="text-muted hover:text-ink" onClick={() => setShowPassword((value) => !value)} size="icon" variant="ghost">{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>}
          type={showPassword ? 'text' : 'password'}
        />
        <FormMessage error={error} />
        <Button className="w-full text-xs font-bold uppercase tracking-[0.05em]" loading={busy} size="lg" type="submit" variant="accent">Sign in</Button>
      </form>
      <p className="mt-5 flex flex-wrap items-center gap-x-3 text-xs text-muted">New to Consumit? <Link className="inline-flex min-h-11 items-center font-bold text-ink hover:text-orange" href="/sign-up">Create your taste space</Link></p>
      <TrustNote className="mt-5" title="Your library stays private by default." tone="lime">You decide what appears on your public profile.</TrustNote>
    </AuthFrame>
  )
}

export function SignUpScreen({ titles = [] }: { titles?: readonly CatalogTitleSummary[] }) {
  const router = useRouter()
  const session = useSession()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle')
  const [step, setStep] = useState<'register' | 'verify'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    const nextEmail = String(data.get('email'))
    try {
      const nextUsername = String(data.get('username'))
      const result = await registerMember({ email: nextEmail, password: String(data.get('password')), username: nextUsername })
      setEmail(nextEmail)
      setUsername(nextUsername)
      setMessage(result.message)
      setStep('verify')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function checkUsername() {
    if (!/^[a-z0-9_]{3,30}$/.test(username.trim().toLowerCase())) return
    setUsernameState('checking')
    try {
      const result = await getUsernameAvailability(username)
      setUsernameState(result.available ? 'available' : 'unavailable')
    } catch {
      setUsernameState('idle')
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await verifyMemberEmail({ code: String(data.get('code')), email })
      session.setMember(member)
      router.push('/onboarding')
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <AuthFrame description="The useful setup takes about two minutes and can be skipped." title={step === 'register' ? 'Create your taste space.' : 'Check your email.'} titles={titles}>
      {step === 'register' ? (
        <form className="space-y-4" method="post" onSubmit={register}>
          <AuthField autoCapitalize="none" autoComplete="username" helper="3–30 lowercase letters, numbers, or underscores." id="sign-up-username" label="Username" maxLength={30} minLength={3} name="username" onBlur={() => void checkUsername()} onChange={(event) => { setUsername(event.currentTarget.value.toLowerCase()); setUsernameState('idle') }} pattern="[a-z0-9_]{3,30}" placeholder="cinema_fan" required value={username} />
          {usernameState === 'checking' ? <p className="text-xs text-muted" role="status">Checking username…</p> : null}
          {usernameState === 'available' ? <p className="text-xs text-lime">Username is available.</p> : null}
          {usernameState === 'unavailable' ? <p className="text-xs text-danger" role="alert">That username is unavailable.</p> : null}
          <AuthField autoComplete="email" id="sign-up-email" label="Email" name="email" placeholder="you@example.com" required type="email" />
          <AuthField autoComplete="new-password" helper="Use 12–128 characters. A password manager is even better." id="sign-up-password" label="Password" minLength={12} name="password" placeholder="At least 12 characters" required type="password" />
          <div className="relative flex min-h-11 items-center gap-3">
            <input className="peer absolute left-0 size-11 cursor-pointer opacity-0" defaultChecked id="account-terms" name="termsAccepted" required type="checkbox" />
            <span aria-hidden="true" className="pointer-events-none grid size-4 shrink-0 place-items-center rounded-micro border border-control-outline bg-surface text-canvas peer-checked:border-orange peer-checked:bg-orange [&_svg]:size-3 [&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100"><Check /></span>
            <p className="text-[0.6875rem] leading-5 text-muted"><label htmlFor="account-terms">I agree to the </label><Link className="text-copy underline" href="/terms">Terms</Link> and <Link className="text-copy underline" href="/privacy">Privacy Policy</Link>.</p>
          </div>
          <FormMessage error={error} />
          <Button className="w-full" loading={busy} size="lg" type="submit" variant="accent">Create account</Button>
        </form>
      ) : (
        <form className="space-y-5" method="post" onSubmit={verify}>
          <p className="text-sm leading-6 text-copy">Enter the six-digit code sent to <strong className="text-ink">{email}</strong>. Creating the account finishes only after this step.</p>
          <AuthField autoComplete="one-time-code" id="sign-up-code" inputMode="numeric" label="Verification code" maxLength={6} name="code" pattern="[0-9]{6}" required />
          <FormMessage error={error} message={message} />
          <Button className="w-full" loading={busy} size="lg" type="submit" variant="accent">Verify and continue</Button>
          <Button className="w-full" onClick={() => void requestEmailVerification(email).then((result) => setMessage(result.message)).catch((caught) => setError(errorMessage(caught)))} type="button" variant="secondary">Send another code</Button>
        </form>
      )}
      <p className="mt-5 text-xs text-muted">Already a member? <Link className="font-bold text-ink hover:text-orange" href="/sign-in">Sign in</Link></p>
    </AuthFrame>
  )
}

export function VerifyEmailScreen() {
  const router = useRouter()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await verifyMemberEmail({ code: String(data.get('code')), email: String(data.get('email')) })
      session.setMember(member)
      router.push('/onboarding')
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }
  return <AuthFrame description="Finish creating your account without putting private codes in a URL." title="Verify your email."><form className="space-y-5" method="post" onSubmit={submit}><AuthField autoComplete="email" id="verify-email" label="Email" name="email" required type="email" /><AuthField autoComplete="one-time-code" id="verify-code" inputMode="numeric" label="Verification code" maxLength={6} name="code" pattern="[0-9]{6}" required /><FormMessage error={error} /><Button className="w-full" loading={busy} type="submit" variant="accent">Verify email</Button></form></AuthFrame>
}

export function ForgotPasswordScreen() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const email = String(new FormData(event.currentTarget).get('email'))
    try { setMessage((await requestPasswordRecovery(email)).message) } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  return <AuthFrame description="We answer the same way whether an address belongs to a member or not." title="Reset your password."><form className="space-y-5" method="post" onSubmit={submit}><AuthField autoComplete="email" id="recovery-email" label="Email" name="email" required type="email" /><FormMessage error={error} message={message} /><Button className="w-full" loading={busy} type="submit" variant="accent">Send reset code</Button>{message ? <Link className="inline-flex min-h-11 items-center font-bold text-ink hover:text-orange" href="/reset-password">I have a reset code</Link> : null}</form></AuthFrame>
}

export function ResetPasswordScreen() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      await confirmPasswordRecovery({ code: String(data.get('code')), email: String(data.get('email')), newPassword: String(data.get('newPassword')) })
      router.push('/sign-in')
    } catch (caught) { setError(errorMessage(caught)); setBusy(false) }
  }
  return <AuthFrame description="Use the code from your email and choose a new password." title="Choose a new password."><form className="space-y-5" method="post" onSubmit={submit}><AuthField autoComplete="email" id="reset-email" label="Email" name="email" required type="email" /><AuthField autoComplete="one-time-code" id="reset-code" inputMode="numeric" label="Reset code" maxLength={6} name="code" pattern="[0-9]{6}" required /><AuthField autoComplete="new-password" id="reset-password" label="New password" minLength={12} name="newPassword" required type="password" /><FormMessage error={error} /><Button className="w-full" loading={busy} type="submit" variant="accent">Reset password</Button></form></AuthFrame>
}
