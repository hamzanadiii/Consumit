import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../lib/cn'

const avatarSizeClasses = {
  lg: 'size-16 text-base',
  md: 'size-11 text-sm',
  sm: 'size-8 text-[0.6875rem]',
  xl: 'size-24 text-xl',
} as const

export type AvatarSize = keyof typeof avatarSizeClasses
export type PresenceState = 'away' | 'offline' | 'online'

const presenceClasses: Record<PresenceState, string> = {
  away: 'bg-orange',
  offline: 'bg-muted',
  online: 'bg-lime',
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export type AvatarProps = Omit<ComponentProps<'span'>, 'children'> & {
  decorative?: boolean | undefined
  imageAlt?: string | undefined
  name: string
  size?: AvatarSize | undefined
  src?: string | undefined
  status?: PresenceState | undefined
}

export function Avatar({
  className,
  decorative = true,
  imageAlt = '',
  name,
  size = 'md',
  src,
  status,
  ...props
}: AvatarProps) {
  const label = status ? `${name}, ${status}` : name

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-full border border-ink/20 bg-[linear-gradient(135deg,#e29a72_0_48%,#382c43_49%_100%)] font-bold text-canvas',
        avatarSizeClasses[size],
        className,
      )}
      data-consumit-avatar
      role={decorative ? undefined : 'img'}
      {...props}
    >
      {src ? (
        <img
          alt={imageAlt}
          className="size-full rounded-full object-cover"
          src={src}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name) || 'C'}</span>
      )}
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

export type AvatarGroupItem = {
  name: string
  src?: string | undefined
  status?: PresenceState | undefined
}

export type AvatarGroupProps = Omit<ComponentProps<'div'>, 'children'> & {
  items: readonly AvatarGroupItem[]
  label: string
  max?: number | undefined
  size?: Extract<AvatarSize, 'md' | 'sm'> | undefined
}

export function AvatarGroup({
  className,
  items,
  label,
  max = 3,
  size = 'sm',
  ...props
}: AvatarGroupProps) {
  const visible = items.slice(0, max)
  const overflow = Math.max(items.length - visible.length, 0)

  return (
    <div
      aria-label={label}
      className={cn('flex items-center', className)}
      data-consumit-avatar-group
      role="img"
      {...props}
    >
      {visible.map((item, index) => (
        <Avatar
          className={cn(index > 0 && '-ml-2.5', 'ring-2 ring-canvas')}
          key={`${item.name}-${index}`}
          name={item.name}
          size={size}
          src={item.src}
          status={item.status}
        />
      ))}
      {overflow > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            '-ml-2.5 grid shrink-0 place-items-center rounded-full border-2 border-canvas bg-surface-raised font-bold text-copy',
            avatarSizeClasses[size],
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

export type MemberBylineProps = Omit<ComponentProps<'div'>, 'children'> & {
  action?: ReactNode | undefined
  avatarSrc?: string | undefined
  href?: string | undefined
  meta?: ReactNode | undefined
  name: string
  status?: PresenceState | undefined
}

export function MemberByline({
  action,
  avatarSrc,
  className,
  href,
  meta,
  name,
  status,
  ...props
}: MemberBylineProps) {
  const identity = (
    <>
      <Avatar name={name} size="sm" src={avatarSrc} status={status} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-ink">
          {name}
          {status ? <span className="sr-only">, {status}</span> : null}
        </span>
        {meta ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted">{meta}</span>
        ) : null}
      </span>
    </>
  )

  return (
    <div
      className={cn('flex min-w-0 items-center gap-3', className)}
      data-consumit-member-byline
      {...props}
    >
      {href ? (
        <a
          className="flex min-w-0 items-center gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          href={href}
        >
          {identity}
        </a>
      ) : (
        <div className="flex min-w-0 items-center gap-3">{identity}</div>
      )}
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
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
