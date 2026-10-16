'use client'

import { ChevronDown, Star } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { parseRatingRange } from './rating-filter-value'
export { matchesRatingFilter, parseRatingRange, type RatingRangeValue } from './rating-filter-value'
function stars(score: number) { return `${score / 2} ${score === 2 ? 'star' : 'stars'}` }
function bounds(value: string): [number, number] {
  return parseRatingRange(value) ?? (/^(?:[1-9]|10)$/.test(value) ? [Number(value), Number(value)] : [1, 10])
}

/** Five stars with half-star steps map to the member's existing 1–10 scale. */
export function RatingFilter({ label = 'Filter by your rating', onChange, unavailable, value }: {
  label?: string
  onChange: (value: string) => void
  unavailable?: 'all' | 'none' | undefined
  value: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<[number, number]>(() => bounds(value))
  const [draftTouched, setDraftTouched] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const firstOption = useRef<HTMLButtonElement>(null)
  const anchor = useRef<number | null>(null)
  const dragRange = useRef<[number, number] | null>(null)
  const id = useId()
  const disabled = unavailable === 'all'
  function close() { setOpen(false); trigger.current?.focus() }
  function choose(next: string) { onChange(next); close() }
  function show() { setDraft(bounds(value)); setDraftTouched(false); setOpen(true) }
  useEffect(() => {
    if (!open) return
    firstOption.current?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const range = parseRatingRange(value)
  const selected = value === 'any' ? 'Rating' : value === 'none' ? 'No rating' : range ? `${range[0] / 2}–${range[1] / 2} stars` : stars(Number(value))
  function scoreAt(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return Math.min(10, Math.max(1, Math.ceil((event.clientX - box.left) / box.width * 10)))
  }
  function apply(range: [number, number]) { choose(range[0] === range[1] ? String(range[0]) : `${range[0]}-${range[1]}`) }
  return <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); close() } }} ref={root}>
    <button aria-controls={open ? id : undefined} aria-expanded={open} aria-haspopup="dialog" aria-label={`${label}: ${selected}`} className={`inline-flex min-h-10 items-center gap-2 rounded-control px-2 text-xs outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] ${value === 'any' ? 'text-[var(--fs-muted)]' : 'text-[var(--fs-accent)]'}`} onClick={() => open ? close() : show()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show() } }} ref={trigger} type="button">{selected}<ChevronDown aria-hidden="true" className={`size-3 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button>
    {open ? <div aria-label={label} className="absolute right-0 top-full z-50 mt-1 w-64 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-ink)] shadow-[0_10px_24px_rgb(0_0_0/0.3)]" id={id} role="dialog">
      <div aria-label="Rating choices" className="p-1" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')]
        const current = options.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
        options[next]?.focus()
      }} role="listbox">
        <button aria-selected={value === 'any'} className="block min-h-10 w-full rounded-control px-3 text-left text-sm outline-none hover:bg-[var(--fs-hover)] focus-visible:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus)]" onClick={() => choose('any')} ref={firstOption} role="option" type="button">Any rating</button>
        <button aria-selected={value === 'none'} className="block min-h-10 w-full rounded-control px-3 text-left text-sm outline-none hover:bg-[var(--fs-hover)] focus-visible:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus)] disabled:cursor-not-allowed disabled:opacity-50" disabled={unavailable === 'all' || unavailable === 'none'} onClick={() => choose('none')} role="option" type="button">No rating</button>
      </div>
      <fieldset className="border-t border-[var(--fs-line)] p-4" disabled={disabled}>
        <legend className="sr-only">Rating or range</legend>
        <p className="text-xs text-[var(--fs-muted)]">Rating or range</p>
        <div aria-hidden="true" className={`my-3 flex touch-none select-none ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-ew-resize'}`} onPointerCancel={() => { anchor.current = null; dragRange.current = null; setDraft(bounds(value)) }} onPointerDown={event => { if (disabled || event.button !== 0) return; event.preventDefault(); setDraftTouched(true); anchor.current = scoreAt(event); dragRange.current = [anchor.current, anchor.current]; setDraft(dragRange.current); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (anchor.current === null) return; const point = scoreAt(event); dragRange.current = [Math.min(anchor.current, point), Math.max(anchor.current, point)]; setDraft(dragRange.current) }} onPointerUp={event => { if (anchor.current === null) return; const next = dragRange.current; anchor.current = null; dragRange.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (next) apply(next) }}>
          {Array.from({ length: 5 }, (_, index) => {
            const left = index * 2 + 1, right = left + 1
            const visible = draftTouched || (value !== 'any' && value !== 'none')
            const start = draft[0] === draft[1] ? 1 : draft[0]
            const low = visible && left >= start && left <= draft[1], high = visible && right >= start && right <= draft[1]
            return <span className="relative block flex-1" key={index}><Star className="size-full fill-[var(--fs-hover)] text-[var(--fs-muted)]" /><span className="pointer-events-none absolute inset-0 overflow-hidden text-[var(--fs-accent)]" style={{ clipPath: low && high ? undefined : low ? 'inset(0 50% 0 0)' : high ? 'inset(0 0 0 50%)' : 'inset(0 100% 0 0)' }}><Star className="size-full fill-current" /></span></span>
          })}
        </div>
        <p aria-live="polite" className="text-sm tabular-nums">{draft[0] === draft[1] ? stars(draft[0]) : `${draft[0] / 2}–${draft[1] / 2} stars`} <span className="text-xs text-[var(--fs-muted)]">({draft[0] === draft[1] ? draft[0] : `${draft[0]}–${draft[1]}`}/10)</span></p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-[var(--fs-muted)]">From<input aria-label="Minimum rating" aria-valuetext={stars(draft[0])} className="mt-2 block w-full cursor-pointer accent-[var(--fs-accent)]" max={10} min={1} onChange={event => { setDraftTouched(true); const low = Number(event.target.value); setDraft([low, Math.max(low, draft[1])]) }} step={1} type="range" value={draft[0]} /></label>
          <label className="text-xs text-[var(--fs-muted)]">To<input aria-label="Maximum rating" aria-valuetext={stars(draft[1])} className="mt-2 block w-full cursor-pointer accent-[var(--fs-accent)]" max={10} min={1} onChange={event => { setDraftTouched(true); const high = Number(event.target.value); setDraft([Math.min(high, draft[0]), high]) }} step={1} type="range" value={draft[1]} /></label>
        </div>
        <button className="mt-3 min-h-9 w-full rounded-control border border-[var(--fs-field-border)] text-xs font-bold outline-none hover:border-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:opacity-50" onClick={() => apply(draft)} type="button">Apply rating</button>
        <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">{disabled ? 'Ratings could not load. Try again later.' : 'Click a star or drag across to set a range.'}</p>
      </fieldset>
    </div> : null}
  </div>
}
