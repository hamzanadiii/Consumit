'use client'

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '../lib/cn'

/** Shared first-party player panels; the backdrop and transport remain visible. */
export function PlayerPanel({ title, heading = title, meta, onBack, backLabel = 'Back to settings', onClose, children, className, role = 'dialog', anchorSelector, anchorElement, ...props }: Omit<ComponentProps<'div'>, 'title'> & {
  title: string
  heading?: string
  meta?: ReactNode
  onBack?: (() => void) | undefined
  backLabel?: string
  onClose: () => void
  /** Internal player destination used to align the compact panel to its trigger. */
  anchorSelector?: string
  /** External wrapper trigger; supplied directly to avoid cross-root selectors. */
  anchorElement?: HTMLElement | null
}) {
  const panel = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const [placement, setPlacement] = useState<CSSProperties | null>(null)
  useEffect(() => { panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }) }, [title])
  useLayoutEffect(() => {
    const element = panel.current
    const root = element?.closest<HTMLElement>('[data-consumit-player], [data-provider-frame]')
    const anchor = anchorElement ?? (anchorSelector ? root?.querySelector<HTMLElement>(anchorSelector) : null)
    if (!element || !root || !anchor) return

    const position = () => {
      const rootRect = root.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const rootLeft = rootRect.left + root.clientLeft
      const rootTop = rootRect.top + root.clientTop
      const rootWidth = root.clientWidth || rootRect.width
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const width = Math.max(0, Math.min(380, rootWidth - 24, viewportWidth - 24))
      const minLeft = Math.max(12, rootLeft + 12)
      const maxLeft = Math.min(rootLeft + rootWidth - width - 12, viewportWidth - width - 12)
      const screenLeft = Math.max(minLeft, Math.min(maxLeft, anchorRect.left + anchorRect.width / 2 - width / 2))
      const availableAbove = Math.max(0, anchorRect.top - 8 - Math.max(rootTop, 12))
      const viewportLimit = Math.min(viewportHeight * 0.62, 520)
      const containingBlock = element.offsetParent instanceof HTMLElement ? element.offsetParent : root
      const blockRect = containingBlock.getBoundingClientRect()
      const blockLeft = blockRect.left + containingBlock.clientLeft
      const blockTop = blockRect.top + containingBlock.clientTop
      const blockBottom = blockTop + (containingBlock.clientHeight || blockRect.height)
      const nextPlacement: CSSProperties = {
        position: 'absolute', inset: 'auto', top: 'auto', right: 'auto',
        left: screenLeft - blockLeft, bottom: Math.max(0, blockBottom - anchorRect.top + 8), width,
        maxWidth: 'none', maxHeight: Math.min(viewportLimit, availableAbove),
      }
      setPlacement(current => current && current.left === nextPlacement.left && current.bottom === nextPlacement.bottom && current.width === nextPlacement.width && current.maxHeight === nextPlacement.maxHeight ? current : nextPlacement)
    }
    position()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    observer?.observe(root)
    observer?.observe(anchor)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    window.visualViewport?.addEventListener('resize', position)
    window.visualViewport?.addEventListener('scroll', position)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      window.visualViewport?.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('scroll', position)
    }
  }, [anchorElement, anchorSelector])
  const content = (
    <div aria-labelledby={props['aria-label'] ? undefined : headingId} {...props} className={cn('consumit-player-panel z-30 overflow-hidden overscroll-contain rounded-card border border-white/15 bg-canvas', className)} data-player-panel ref={panel} role={role} style={{ position: 'absolute', inset: 'auto 12px 72px auto', width: 'min(380px, calc(100% - 24px))', maxHeight: 'min(62dvh, 520px)', ...placement, ...props.style }} aria-modal={role === 'dialog' ? true : undefined} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const candidates = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter(item => !item.closest('[hidden]'))
      const radios = candidates.filter((item): item is HTMLInputElement => item instanceof HTMLInputElement && item.type === 'radio')
      const radioStop = radios.find(item => item.checked) ?? radios[0]
      const items = candidates.filter(item => !radios.includes(item as HTMLInputElement) || item === radioStop)
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <header className="consumit-player-panel-header">
        {onBack ? <button aria-label={backLabel} className="consumit-player-panel-action grid size-[40px] shrink-0 place-items-center rounded-control text-muted outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={onBack} type="button"><ArrowLeft aria-hidden="true" className="size-5" /></button> : null}
        <h3 className="min-w-0 flex-1 text-base font-semibold text-ink" id={headingId}>{heading}</h3>
        {meta ? <span className="text-xs tabular-nums text-muted">{meta}</span> : null}
        <button aria-label={`Close ${title.toLowerCase()}`} className="consumit-player-panel-action grid size-[40px] shrink-0 place-items-center rounded-control text-muted outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" onClick={onClose} type="button"><X aria-hidden="true" className="size-5" /></button>
      </header>
      <div className="consumit-player-panel-body">{children}</div>
    </div>
  )
  return content
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

const RadioName = createContext<string | undefined>(undefined)

/** Native radios supply arrow selection and a single tab stop in each panel. */
export function PlayerRadioGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const name = useId()
  return <RadioName.Provider value={name}><div aria-label={label} className={className} role="radiogroup">{children}</div></RadioName.Provider>
}

export function PlayerRadioOption({ selected, onSelect, disabled, busy, className, title, children }: {
  selected: boolean; onSelect: () => void; disabled?: boolean; busy?: boolean; className?: string; title?: string; children: ReactNode
}) {
  const name = useContext(RadioName)
  return <label className={cn('consumit-player-radio-option', className)} data-disabled={disabled || undefined} title={title}>
    <input aria-busy={busy} aria-checked={selected} checked={selected} className="consumit-player-radio-input" disabled={disabled} name={name} onChange={onSelect} type="radio" />
    {children}
  </label>
}
