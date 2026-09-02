'use client'

import type { ChangeEvent, ComponentProps } from 'react'

import { cn } from '../lib/cn'

export type TabItem = {
  count?: number
  href: string
  label: string
  value: string
}

export type TabsProps = Omit<ComponentProps<'nav'>, 'children'> & {
  activeValue: string
  items: readonly TabItem[]
}

export function Tabs({
  activeValue,
  'aria-label': ariaLabel = 'Section navigation',
  className,
  items,
  ...props
}: TabsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn('overflow-x-auto border-b border-border', className)}
      data-consumit-tabs
      {...props}
    >
      <ul className="flex min-w-max items-stretch gap-7" role="list">
        {items.map((item) => {
          const isActive = item.value === activeValue

          return (
            <li key={item.value}>
              <a
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-14 items-center gap-2 text-sm font-bold text-muted outline-none transition-colors hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange motion-reduce:transition-none',
                  isActive && 'text-ink',
                )}
                href={item.href}
              >
                {item.label}
                {item.count === undefined ? null : (
                  <span className="text-xs font-normal text-faint">
                    {item.count}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-orange transition-transform duration-150 motion-reduce:transition-none',
                    isActive ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const signalClasses = {
  lime: 'bg-lime',
  lilac: 'bg-lilac',
  orange: 'bg-orange',
} as const

export type FilterChipProps = ComponentProps<'button'> & {
  selected?: boolean
  signal?: keyof typeof signalClasses
}

export function FilterChip({
  children,
  className,
  selected = false,
  signal,
  type = 'button',
  ...props
}: FilterChipProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-xs font-bold outline-none transition-[background-color,border-color,color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none',
        selected
          ? 'border-ink bg-ink text-canvas'
          : 'border-control-outline bg-surface text-copy hover:border-ink/60 hover:text-ink',
        className,
      )}
      data-consumit-filter-chip
      type={type}
      {...props}
    >
      {signal ? (
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', signalClasses[signal])}
        />
      ) : null}
      {children}
    </button>
  )
}

export type SelectionOption = {
  disabled?: boolean
  label: string
  value: string
}

export type SegmentedControlProps = Omit<
  ComponentProps<'fieldset'>,
  'children' | 'onChange'
> & {
  defaultValue?: string
  legend: string
  name: string
  onValueChange?: (value: string) => void
  options: readonly SelectionOption[]
  value?: string
}

export function SegmentedControl({
  className,
  defaultValue,
  legend,
  name,
  onValueChange,
  options,
  value,
  ...props
}: SegmentedControlProps) {
  return (
    <fieldset className={cn('min-w-0', className)} {...props}>
      <legend className="sr-only">{legend}</legend>
      <div
        className="grid min-h-11 overflow-hidden rounded-control border border-control-outline bg-field p-0.5"
        data-consumit-segmented-control
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label className="relative min-w-0 cursor-pointer" key={option.value}>
            <input
              checked={value === undefined ? undefined : value === option.value}
              className="peer sr-only"
              defaultChecked={
                value === undefined ? defaultValue === option.value : undefined
              }
              disabled={option.disabled}
              name={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.currentTarget.checked) {
                  onValueChange?.(option.value)
                }
              }}
              type="radio"
              value={option.value}
            />
            <span className="flex min-h-11 items-center justify-center rounded-[4px] px-3 text-center text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted transition-[background-color,color,opacity] peer-checked:bg-ink peer-checked:text-canvas peer-disabled:cursor-not-allowed peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-orange peer-focus-visible:ring-inset motion-reduce:transition-none">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export type ToggleProps = Omit<ComponentProps<'button'>, 'children'> & {
  checked: boolean
  label: string
  onCheckedChange?: (checked: boolean) => void
}

export function Toggle({
  checked,
  className,
  disabled,
  label,
  onCheckedChange,
  onClick,
  type = 'button',
  ...props
}: ToggleProps) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex size-11 shrink-0 cursor-pointer items-center rounded-control bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      data-consumit-toggle
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked)
        }
      }}
      role="switch"
      type={type}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-6 w-11 items-center rounded-full border border-control-outline bg-surface-raised p-0.5 transition-colors duration-150 motion-reduce:transition-none',
          checked && 'border-orange bg-orange',
        )}
      >
        <span
          className={cn(
            'size-[1.125rem] rounded-full bg-muted transition-[background-color,transform] duration-150 motion-reduce:transition-none',
            checked && 'translate-x-5 bg-ink',
          )}
        />
      </span>
    </button>
  )
}

export type IssueSelectorProps = Omit<
  ComponentProps<'fieldset'>,
  'children' | 'onChange'
> & {
  defaultValue?: string
  legend: string
  name: string
  onValueChange?: (value: string) => void
  options: readonly SelectionOption[]
  value?: string
}

export function IssueSelector({
  className,
  defaultValue,
  legend,
  name,
  onValueChange,
  options,
  value,
  ...props
}: IssueSelectorProps) {
  return (
    <fieldset className={cn('min-w-0', className)} {...props}>
      <legend className="font-display text-xl text-ink">{legend}</legend>
      <div
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        data-consumit-issue-selector
      >
        {options.map((option) => (
          <label
            className="relative min-w-0 cursor-pointer"
            key={option.value}
          >
            <input
              checked={value === undefined ? undefined : value === option.value}
              className="peer sr-only"
              defaultChecked={
                value === undefined ? defaultValue === option.value : undefined
              }
              disabled={option.disabled}
              name={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.currentTarget.checked) {
                  onValueChange?.(option.value)
                }
              }}
              type="radio"
              value={option.value}
            />
            <span className="flex min-h-20 items-center gap-3 rounded-control border border-control-outline bg-surface p-4 text-xs font-bold uppercase tracking-[0.04em] text-copy transition-[background-color,border-color,color,opacity] peer-checked:border-orange peer-checked:bg-orange/5 peer-checked:text-ink peer-checked:[&>span]:border-orange peer-checked:[&>span>span]:bg-orange peer-disabled:cursor-not-allowed peer-disabled:opacity-40 peer-focus-visible:ring-2 peer-focus-visible:ring-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas motion-reduce:transition-none">
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-control-outline">
                <span className="size-2 rounded-full bg-transparent" />
              </span>
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
