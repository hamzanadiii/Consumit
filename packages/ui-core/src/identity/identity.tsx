import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'
import { AvatarImage } from './avatar-image'
import { getInitials } from './initials'

const avatarSizeClasses = {
  lg: 'size-16 text-base',
  md: 'size-11 text-sm',
  sm: 'size-8 text-[0.6875rem]',
  xl: 'size-24 text-xl',
} as const

export type AvatarSize = keyof typeof avatarSizeClasses
export type PresenceState = 'away' | 'offline' | 'online'

export type AvatarTreatment = 'dusk' | 'dawn' | 'noir' | 'halo'

export const avatarTreatmentClasses: Record<AvatarTreatment, string> = {
  dusk: 'bg-[linear-gradient(135deg,#e29a72_0_48%,#382c43_49%_100%)] text-canvas',
  dawn: 'bg-[linear-gradient(135deg,#f4f0e8_0%,#eab98c_55%,#8a4f3a_100%)] text-[#121215]',
  noir: 'bg-surface-raised text-ink',
  halo: 'bg-[linear-gradient(135deg,#e29a72_0_48%,#382c43_49%_100%)] text-canvas',
}

const presenceClasses: Record<PresenceState, string> = {
  away: 'bg-orange',
  offline: 'bg-muted',
  online: 'bg-lime',
}

export type AvatarProps = Omit<ComponentProps<'span'>, 'children'> & {
  decorative?: boolean | undefined
  imageAlt?: string | undefined
  name: string
  size?: AvatarSize | undefined
  src?: string | undefined
  status?: PresenceState | undefined
  treatment?: AvatarTreatment | undefined
}

export function Avatar({
  className,
  decorative = true,
  imageAlt = '',
  name,
  size = 'md',
  src,
  status,
  treatment = 'dusk',
  ...props
}: AvatarProps) {
  const label = status ? `${name}, ${status}` : name

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-full border border-ink/20 font-bold',
        src ? 'bg-surface-raised text-ink' : (avatarTreatmentClasses[treatment] ?? avatarTreatmentClasses.dusk),
        avatarSizeClasses[size],
        className,
      )}
      data-consumit-avatar
      data-treatment={treatment}
      role={decorative ? undefined : 'img'}
      {...props}
    >
      {treatment === 'halo' ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-[7%] rounded-full border border-ink/50" />
      ) : null}
      <AvatarImage alt={imageAlt} name={name} src={src} />
      {status ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute right-0 bottom-0 size-[28%] min-h-2 min-w-2 rounded-full border-2 border-canvas',
            presenceClasses[status],
          )}
          data-consumit-presence={status}
        />
      ) : null}
    </span>
  )
}

export type ServiceMarkProps = Omit<ComponentProps<'div'>, 'children'> & {
  description?: string | undefined
  name: string
  src?: string | undefined
  status?: 'connected' | 'unavailable' | undefined
}

export function ServiceMark({
  className,
  description,
  name,
  src,
  status,
  ...props
}: ServiceMarkProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-control border border-border bg-surface px-3 py-2.5',
        className,
      )}
      data-consumit-service-mark
      {...props}
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-micro border border-border bg-surface-raised text-xs font-bold text-copy">
        {src ? (
          <img alt="" className="size-full object-contain p-1.5" src={src} />
        ) : (
          getInitials(name).slice(0, 1)
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-ink">{name}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-[0.6875rem] text-muted">
            {description}
          </span>
        ) : null}
      </span>
      {status ? (
        <span className="sr-only">{status}</span>
      ) : null}
      {status ? (
        <span
          aria-hidden="true"
          className={cn(
            'ml-auto size-2 rounded-full',
            status === 'connected' ? 'bg-lime' : 'bg-muted',
          )}
        />
      ) : null}
    </div>
  )
}
