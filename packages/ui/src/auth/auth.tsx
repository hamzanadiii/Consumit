import type { ComponentProps, ReactNode } from 'react'

import { Input, type InputProps } from '../input/input'
import { Label } from '../label/label'
import { cn } from '../lib/cn'

export type AuthShellProps = Omit<ComponentProps<'main'>, 'children' | 'title'> & {
  artworkSrc?: string | undefined
  asideContent?: ReactNode | undefined
  asideDescription?: string | undefined
  asideTitle?: string | undefined
  children: ReactNode
  description?: string | undefined
  footer?: ReactNode | undefined
  header?: ReactNode | undefined
  title: string
}

export function AuthShell({
  artworkSrc,
  asideContent,
  asideDescription,
  asideTitle,
  children,
  className,
  description,
  footer,
  header,
  title,
  ...props
}: AuthShellProps) {
  return (
    <main
      className={cn('grid min-h-[44rem] overflow-hidden rounded-card border border-border bg-canvas lg:grid-cols-[1.08fr_.92fr]', className)}
      data-consumit-auth-shell
      {...props}
    >
      <section className="relative isolate hidden min-h-full overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
        {artworkSrc ? <img alt="" className="absolute inset-0 -z-20 size-full object-cover" src={artworkSrc} /> : null}
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-canvas/35" />
        {header}
        <div className="max-w-lg">
          {asideTitle ? <h2 className="text-balance font-display text-5xl leading-[0.95] tracking-[-0.025em] text-ink">{asideTitle}</h2> : null}
          {asideDescription ? <p className="mt-6 max-w-[52ch] text-sm leading-6 text-copy">{asideDescription}</p> : null}
          {asideContent ? <div className="mt-6">{asideContent}</div> : null}
        </div>
      </section>
      <section className="flex min-w-0 flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[31rem]">
          <h1 className="text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">{title}</h1>
          {description ? <p className="mt-4 text-sm leading-6 text-muted">{description}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-xs leading-5 text-muted">{footer}</div> : null}
        </div>
      </section>
    </main>
  )
}

export type AuthFieldProps = Omit<InputProps, 'children'> & {
  action?: ReactNode | undefined
  error?: string | undefined
  helper?: string | undefined
  label: string
}

export function AuthField({
  action,
  className,
  error,
  helper,
  id,
  label,
  ...props
}: AuthFieldProps) {
  const inputId = id ?? props.name
  const descriptionId = inputId && (error || helper) ? `${inputId}-description` : undefined

  return (
    <div data-consumit-auth-field>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <Label htmlFor={inputId}>{label}</Label>
        {action ? <div className="text-xs">{action}</div> : null}
      </div>
      <Input
        aria-describedby={descriptionId}
        aria-invalid={error ? true : undefined}
        className={cn('mt-2', className)}
        id={inputId}
        {...props}
      />
      {error || helper ? (
        <p className={cn('mt-2 text-xs leading-5', error ? 'text-copy' : 'text-muted')} id={descriptionId}>
          {error ?? helper}
        </p>
      ) : null}
    </div>
  )
}

export type SocialAuthButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  label: string
  provider: string
  tone?: 'dark' | 'light' | undefined
}

export function SocialAuthButton({
  className,
  label,
  provider,
  tone = 'dark',
  type = 'button',
  ...props
}: SocialAuthButtonProps) {
  return (
    <button
      aria-label={`${label} using ${provider}`}
      className={cn(
        'flex h-12 w-full items-center gap-4 rounded-control border px-4 text-left text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none',
        tone === 'light'
          ? 'border-ink bg-ink text-canvas hover:bg-white'
          : 'border-control-outline bg-surface text-ink hover:bg-surface-raised',
        className,
      )}
      data-consumit-social-auth-button
      type={type}
      {...props}
    >
      <span aria-hidden="true" className={cn('size-4 rounded-full', provider.toLowerCase() === 'google' ? 'bg-orange' : tone === 'light' ? 'bg-canvas' : 'bg-ink')} />
      <span>{label}</span>
    </button>
  )
}

export type TrustNoteProps = Omit<ComponentProps<'aside'>, 'children' | 'title'> & {
  children: ReactNode
  title: string
  tone?: 'lime' | 'lilac' | 'orange' | undefined
}

const trustToneClasses = {
  lime: 'bg-lime',
  lilac: 'bg-lilac',
  orange: 'bg-orange',
} as const

export function TrustNote({
  children,
  className,
  title,
  tone = 'lilac',
  ...props
}: TrustNoteProps) {
  return (
    <aside className={cn('flex gap-4 rounded-card border border-border bg-surface p-4', className)} data-consumit-trust-note {...props}>
      <span aria-hidden="true" className={cn('mt-1 size-2 shrink-0 rounded-full', trustToneClasses[tone])} />
      <div>
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        <div className="mt-2 text-xs leading-5 text-muted">{children}</div>
      </div>
    </aside>
  )
}
