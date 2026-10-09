'use client'

import { useEffect, useId, useRef, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '../lib/cn'

/** Shared first-party player panels; the backdrop and transport remain visible. */
export function PlayerPanel({ title, meta, onBack, backLabel = 'Back to settings', onClose, children, className, ...props }: Omit<ComponentProps<'div'>, 'title'> & {
  title: string
  meta?: ReactNode
  onBack?: (() => void) | undefined
  backLabel?: string
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }) }, [])
  return (
    <div {...props} className={cn('consumit-player-panel fixed inset-x-0 bottom-0 z-30 max-h-[75dvh] overflow-y-auto overscroll-contain rounded-t-card border border-white/15 bg-canvas sm:absolute sm:inset-x-auto sm:bottom-20 sm:right-6 sm:max-h-[70dvh] sm:w-84 sm:rounded-card', className)} data-player-panel ref={panel} role="menu">
      <header className="consumit-player-panel-header sticky top-0 z-10 flex min-h-[52px] items-center gap-2 border-b border-border bg-canvas px-3 py-1.5">
        {onBack ? <button aria-label={backLabel} className="consumit-player-panel-action grid size-[40px] shrink-0 place-items-center rounded-control text-muted outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={onBack} type="button"><ArrowLeft aria-hidden="true" className="size-5" /></button> : null}
        <h3 className="min-w-0 flex-1 text-base font-semibold text-ink">{title}</h3>
        {meta ? <span className="text-xs tabular-nums text-muted">{meta}</span> : null}
        <button aria-label={`Close ${title.toLowerCase()}`} className="consumit-player-panel-action grid size-[40px] shrink-0 place-items-center rounded-control text-muted outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={onClose} type="button"><X aria-hidden="true" className="size-5" /></button>
      </header>
      {children}
    </div>
  )
}

export function PlayerSettingRow({ icon, label, value, onClick, disabled }: {
  icon: ReactNode
  label: string
  value?: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return <button className="consumit-player-setting-row flex min-h-[44px] w-full items-center gap-3 rounded-control px-3 text-sm text-ink outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:opacity-50" disabled={disabled} onClick={onClick} type="button">
    <span aria-hidden="true" className="consumit-player-setting-icon">{icon}</span>
    <span className="min-w-0 flex-1 text-left font-medium">{label}</span>
    {value ? <span className="max-w-[40%] truncate text-xs text-muted">{value}</span> : null}
    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
  </button>
}

export function PlayerAdjustment({ label, accessibleLabel = label, valueLabel, value, min, max, step, ticks, onChange, disabled }: {
  label: string
  accessibleLabel?: string
  valueLabel: string
  value: number
  min: number
  max: number
  step: number
  ticks: readonly { value: number; label: string }[]
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const id = useId()
  const progress = max === min ? 0 : (value - min) / (max - min) * 100
  return <div className="consumit-player-adjustment">
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm font-medium text-ink" htmlFor={id}>{label}</label>
      <output className="text-sm tabular-nums text-copy" htmlFor={id}>{valueLabel}</output>
    </div>
    <input aria-label={accessibleLabel} aria-valuetext={valueLabel} className="consumit-player-range" disabled={disabled} id={id} max={max} min={min} onChange={(event) => onChange(Number(event.currentTarget.value))} step={step} style={{ '--player-range-progress': `${progress}%` } as CSSProperties} type="range" value={value} />
    <div aria-hidden="true" className="consumit-player-range-ticks">
      {ticks.map((tick) => <span key={tick.value} style={{ left: `${max === min ? 0 : (tick.value - min) / (max - min) * 100}%` }}>{tick.label}</span>)}
    </div>
  </div>
}
