import type { ComponentProps, ReactNode } from 'react'
import { Upload } from 'lucide-react'

import { Avatar } from '../identity/identity'
import { cn } from '../lib/cn'

export type SettingsRailItem = {
  href: string
  label: string
}

export type SettingsRailProps = Omit<ComponentProps<'aside'>, 'children'> & {
  activeHref?: string | undefined
  avatarSrc?: string | undefined
  handle?: string | undefined
  items: readonly SettingsRailItem[]
  memberName?: string | undefined
}

export function SettingsRail({
  activeHref,
  avatarSrc,
  className,
  handle,
  items,
  memberName,
  ...props
}: SettingsRailProps) {
  return (
    <aside className={cn('rounded-card border border-border bg-surface p-4', className)} data-consumit-settings-rail {...props}>
      {memberName ? (
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <Avatar name={memberName} size="md" src={avatarSrc} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{memberName}</p>
            {handle ? <p className="mt-0.5 truncate text-xs text-muted">{handle}</p> : null}
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
      <div className="mt-6 rounded-card border border-border bg-surface px-5">{children}</div>
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

export type HealthEntry = {
  detail?: string | undefined
  label: string
  status: 'healthy' | 'slow' | 'unavailable'
}

const healthClasses: Record<HealthEntry['status'], string> = {
  healthy: 'bg-lime',
  slow: 'bg-copy',
  unavailable: 'bg-muted',
}

export type HealthSummaryProps = Omit<ComponentProps<'aside'>, 'children'> & {
  entries: readonly HealthEntry[]
  title?: string | undefined
}

export function HealthSummary({
  className,
  entries,
  title = 'Source health',
  ...props
}: HealthSummaryProps) {
  return (
    <aside className={cn('rounded-card border border-border bg-surface p-5', className)} data-consumit-health-summary {...props}>
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <dl className="mt-4">
        {entries.map((entry) => (
          <div className="flex min-h-12 items-center gap-3 border-t border-border first:border-t-0" key={entry.label}>
            <dt className="min-w-0 flex-1 text-xs text-copy">{entry.label}</dt>
            <dd className="flex items-center gap-2 text-xs capitalize text-muted">
              <span aria-hidden="true" className={cn('size-2 rounded-full', healthClasses[entry.status])} />
              {entry.detail ?? entry.status}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

export type DropzoneProps = Omit<ComponentProps<'input'>, 'children' | 'title' | 'type'> & {
  description?: string | undefined
  title: string
}

export function Dropzone({
  accept = 'image/png,image/jpeg,video/mp4',
  className,
  description,
  title,
  ...props
}: DropzoneProps) {
  return (
    <label className={cn('relative flex min-h-32 cursor-pointer items-center gap-4 rounded-card border border-dashed border-control-outline bg-surface p-5 outline-none transition-colors hover:border-orange focus-within:border-orange focus-within:ring-2 focus-within:ring-orange focus-within:ring-offset-2 focus-within:ring-offset-canvas motion-reduce:transition-none', className)} data-consumit-dropzone>
      <input accept={accept} className="sr-only" type="file" {...props} />
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-control bg-surface-raised text-orange">
        <Upload className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink">{title}</span>
        {description ? <span className="mt-2 block text-xs leading-5 text-muted">{description}</span> : null}
      </span>
    </label>
  )
}
