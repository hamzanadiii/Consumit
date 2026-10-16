'use client'

import type { ReactNode, RefObject } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { CaptionSize, CaptionBackground, CaptionPosition, CaptionFont } from './player-settings'
import { formatSubtitleDelayMs, type SubtitleCue } from './subtitle-sync'

function ChoiceRow<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string; short?: string }[]; onChange: (value: T) => void
}) {
  return <div className="consumit-caption-choice" role="group" aria-label={`Caption ${label.toLowerCase()}`}>
    <span className="text-xs text-copy">{label}</span>
    <div className="flex min-w-0">
      {options.map(option => <button aria-label={option.label} aria-pressed={value === option.value} className="consumit-caption-choice-button" key={option.value} onClick={() => onChange(option.value)} type="button">{option.short ?? option.label}</button>)}
    </div>
  </div>
}

export function SubtitleAppearance({ size, background, position, font, preview, onSize, onBackground, onPosition, onFont }: {
  size: CaptionSize; background: CaptionBackground; position: CaptionPosition; font: CaptionFont
  preview: ReactNode
  onSize: (value: CaptionSize) => void; onBackground: (value: CaptionBackground) => void
  onPosition: (value: CaptionPosition) => void; onFont: (value: CaptionFont) => void
}) {
  return <div className="px-3 py-2">
    <div aria-label="Subtitle preview" className="flex min-h-24 items-center justify-center overflow-hidden border-b border-border py-4">{preview}</div>
    <ChoiceRow label="Size" value={size} onChange={onSize} options={[{ value: 'small', label: 'Small', short: 'S' }, { value: 'medium', label: 'Medium', short: 'M' }, { value: 'large', label: 'Large', short: 'L' }, { value: 'xlarge', label: 'Extra large', short: 'XL' }]} />
    <ChoiceRow label="Style" value={background} onChange={onBackground} options={[{ value: 'cinematic', label: 'Cinematic' }, { value: 'boxed', label: 'Boxed' }, { value: 'subtle', label: 'Subtle' }]} />
    <ChoiceRow label="Position" value={position} onChange={onPosition} options={[{ value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }]} />
    <ChoiceRow label="Font" value={font} onChange={onFont} options={[{ value: 'filscreen', label: 'FilScreen' }, { value: 'sans', label: 'Sans' }]} />
  </div>
}

export function SubtitleSync({ delay, cues, activeIndex, captionsOn, status, listRef, onHover, onCue, onAdjust, onReset }: {
  delay: number; cues: readonly SubtitleCue[]; activeIndex: number; captionsOn: boolean; status: string | null
  listRef: RefObject<HTMLDivElement | null>; onHover: (value: boolean) => void
  onCue: (cue: SubtitleCue) => void; onAdjust: (value: number) => void; onReset: () => void
}) {
  return <div className="space-y-3 p-3">
    <div className="flex items-center justify-between gap-3 text-sm"><span className="text-copy">Offset</span><output aria-live="polite" className="font-medium tabular-nums text-ink">{formatSubtitleDelayMs(delay)}</output></div>
    <div aria-label="Fine tune offset" className="consumit-sync-adjustments" role="group">
      <button aria-label="Shift subtitles backwards 50 milliseconds" onClick={() => onAdjust(-50)} type="button"><Minus aria-hidden="true" className="size-3.5" />50 ms</button>
      <button aria-label="Reset subtitle sync offset" onClick={onReset} type="button"><RotateCcw aria-hidden="true" className="size-3.5" />Reset</button>
      <button aria-label="Shift subtitles forwards 50 milliseconds" onClick={() => onAdjust(50)} type="button"><Plus aria-hidden="true" className="size-3.5" />50 ms</button>
    </div>
    <p className="text-xs leading-5 text-copy">Select a line when you hear it spoken.</p>
    <div aria-label="Subtitle lines" className="consumit-sync-lines" onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onTouchStart={() => onHover(true)} ref={listRef} role="group">
      {cues.length === 0 ? <p className="grid h-full place-items-center text-center text-xs text-muted">{captionsOn ? 'No subtitles loaded' : 'Subtitles are off'}</p> : cues.map((cue, index) => <button aria-current={index === activeIndex ? 'true' : undefined} className="consumit-sync-line" key={`${cue.startTime}-${index}`} onClick={() => onCue(cue)} type="button"><bdi className="line-clamp-2" dir="auto">{cue.text}</bdi></button>)}
    </div>
    <p aria-live="polite" className="sr-only" role="status">{status}</p>
  </div>
}
