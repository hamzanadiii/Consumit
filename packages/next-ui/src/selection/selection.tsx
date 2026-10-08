'use client'

import type { ChangeEvent, ComponentProps, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

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
      className={cn('overscroll-x-contain overflow-x-auto border-b border-border scroll-smooth', className)}
      data-consumit-tabs
      {...props}
    >
      <ul className="flex min-w-max items-stretch gap-7" role="list">
        {items.map((item) => {
          const isActive = item.value === activeValue

          return (
            <li key={item.value}>
              <a
                aria-label={item.count === undefined ? undefined : `${item.label}, ${item.count}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-14 items-center gap-2 text-sm font-bold text-muted outline-none transition-colors hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange motion-reduce:transition-none',
                  isActive && 'text-ink',
                )}
                href={item.href}
              >
                {item.label}
                {item.count === undefined ? null : (
                  <span className="text-xs font-normal text-muted">
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

export type SelectProps = Omit<ComponentProps<'div'>, 'children' | 'onChange'> & {
  disabled?: boolean | undefined
  hideLabel?: boolean | undefined
  id?: string | undefined
  label: string
  name?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  options: readonly SelectionOption[]
  placeholder?: string | undefined
  triggerLabel?: ReactNode | undefined
  value?: string | undefined
  variant?: 'field' | 'toolbar' | undefined
}

/**
 * FilScreen dropdown: a fully styled listbox that replaces the OS-rendered
 * native select popup (which no stylesheet can theme). Trigger, popup, and
 * options all honor the Consumit tokens — including the FilScreen remap —
 * in both themes, with complete listbox keyboard support.
 */
export function Select({
  className,
  disabled = false,
  hideLabel = false,
  id,
  label,
  name,
  onValueChange,
  options,
  placeholder = 'Select…',
  triggerLabel,
  value,
  variant = 'field',
  ...props
}: SelectProps) {
  const generatedId = useId()
  const triggerId = id ?? `consumit-select-${generatedId}`
  const labelId = `${triggerId}-label`
  const listboxId = `${triggerId}-listbox`
  const selectedIndex = options.findIndex((option) => option.value === value)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  function openListbox(atIndex?: number) {
    if (disabled) return
    const requested = atIndex ?? selectedIndex
    setActiveIndex(requested >= 0 && options[requested] && !options[requested]?.disabled ? requested : options.findIndex((option) => !option.disabled))
    setOpen(true)
  }

  function closeListbox(focusTrigger = true) {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }

  function choose(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onValueChange?.(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Outside dismissal; runs only while open, after mount.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open ])

  // Move keyboard focus with the active option while open.
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  function move(delta: 1 | -1) {
    if (options.length === 0) return
    let next = activeIndex
    for (let step = 0; step < options.length; step += 1) {
      next = (next + delta + options.length) % options.length
      if (!options[next]?.disabled) break
    }
    setActiveIndex(next)
  }

  function onListboxKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      const first = options.findIndex((option) => !option.disabled)
      if (first >= 0) setActiveIndex(first)
    } else if (event.key === 'End') {
      event.preventDefault()
      for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index]?.disabled) {
          setActiveIndex(index)
          break
        }
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(activeIndex)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeListbox()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  return (
    <div className={cn('relative min-w-0', className)} data-consumit-select ref={rootRef} {...props}>
      <span className={hideLabel ? 'sr-only' : 'mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-copy'} id={labelId}>
        {label}
      </span>
      {name ? <input disabled={disabled} name={name} type="hidden" value={value ?? ''} /> : null}
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${triggerId}-value`}
        className={cn('flex w-full cursor-pointer items-center gap-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-not-allowed disabled:opacity-40', variant === 'toolbar' ? 'h-10 rounded-control px-2 text-muted hover:bg-surface-raised hover:text-ink' : 'h-11 rounded-xl border border-control-outline bg-field pr-3 pl-4 text-ink hover:border-muted focus-visible:border-orange')}
        disabled={disabled}
        id={triggerId}
        onClick={() => (open ? closeListbox(false) : openListbox())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openListbox()
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            openListbox(options.length - 1)
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className={cn('min-w-0 flex-1 truncate', variant === 'toolbar' ? 'max-w-[24ch] font-medium' : 'font-bold')} id={`${triggerId}-value`}>
          {triggerLabel ?? (selected ? selected.label : <span className="font-normal text-muted">{placeholder}</span>)}
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul
          aria-labelledby={labelId}
          className={cn('absolute top-full z-50 mt-2 max-h-64 overflow-y-auto border border-control-outline bg-surface p-1.5 shadow-xl outline-none', variant === 'toolbar' ? 'right-0 w-max min-w-[14rem] max-w-[min(22rem,calc(100vw-2rem))] rounded-control' : 'inset-x-0 rounded-xl')}
          id={listboxId}
          onKeyDown={onListboxKeyDown}
          role="listbox"
          tabIndex={-1}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li key={option.value} role="presentation">
                <button
                  aria-selected={isSelected}
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors motion-reduce:transition-none',
                    isSelected
                      ? 'bg-orange/10 font-bold text-ink'
                      : 'text-copy hover:bg-surface-raised hover:text-ink focus-visible:bg-surface-raised focus-visible:text-ink',
                    option.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-copy',
                  )}
                  disabled={option.disabled}
                  onClick={() => choose(index)}
                  ref={(node) => {
                    optionRefs.current[index] = node
                  }}
                  role="option"
                  tabIndex={index === activeIndex ? 0 : -1}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0 text-orange" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
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
