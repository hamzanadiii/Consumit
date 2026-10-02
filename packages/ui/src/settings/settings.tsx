import type { ComponentProps, ReactNode } from 'react'

import { Avatar, type AvatarTreatment } from '../identity/identity'
import { cn } from '../lib/cn'

export type SettingsRailItem = {
  href: string
  label: string
}

export type SettingsRailProps = Omit<ComponentProps<'aside'>, 'children'> & {
  activeHref?: string | undefined
  avatarSrc?: string | undefined
  avatarTreatment?: AvatarTreatment | undefined
  username?: string | undefined
  items: readonly SettingsRailItem[]
  memberName?: string | undefined
}

export function SettingsRail({
  activeHref,
  avatarSrc,
  avatarTreatment = 'dusk',
  className,
  username,
  items,
  memberName,
  ...props
}: SettingsRailProps) {
  return (
    <aside className={cn('border-t border-border pt-4', className)} data-consumit-settings-rail {...props}>
      {memberName ? (
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Avatar name={memberName} size="md" src={avatarSrc} treatment={avatarTreatment} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{memberName}</p>
            {username ? <p className="mt-0.5 truncate text-xs text-muted">{username}</p> : null}
          </div>
        </div>
      ) : null}
      <nav aria-label="Settings" className={cn(memberName && 'mt-4')}>
        <ul className="space-y-1">
          {items.map((item) => {
            const active = item.href === activeHref
            return (
              <li key={item.href}>
                <a
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex min-h-11 items-center rounded-control border-l px-3 text-sm font-bold outline-none transition-colors hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none', active ? 'border-orange bg-surface-raised text-ink' : 'border-transparent text-muted')}
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

export type SettingsSectionProps = Omit<ComponentProps<'section'>, 'children' | 'title'> & {
  action?: ReactNode | undefined
  children: ReactNode
  description?: string | undefined
  title: string
}

export function SettingsSection({
  action,
  children,
  className,
  description,
  title,
  ...props
}: SettingsSectionProps) {
  return (
    <section className={cn('border-b border-border pb-9', className)} data-consumit-settings-section {...props}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-3xl leading-none text-ink">{title}</h2>
          {description ? <p className="mt-3 text-sm leading-6 text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-6 border-t border-border">{children}</div>
    </section>
  )
}

export type PreferenceRowProps = Omit<ComponentProps<'div'>, 'children'> & {
  control: ReactNode
  description?: string | undefined
  label: string
}

export function PreferenceRow({
  className,
  control,
  description,
  label,
  ...props
}: PreferenceRowProps) {
  return (
    <div className={cn('flex min-h-20 items-center gap-5 border-b border-border py-4 last:border-b-0', className)} data-consumit-preference-row {...props}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}
