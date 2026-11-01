'use client'

import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Button, buttonVariants } from '../button/button'
import { cn } from '../lib/cn'
import type { PlaybackRecoveryViewModel } from './player-types'

export type PlayerRecoveryPanelProps = {
  recovery: PlaybackRecoveryViewModel
  title: string
  providerName?: string | undefined
  returnHref?: string | undefined
  onCancel?: (() => void) | undefined
  onChooseSource?: (() => void) | undefined
  onRetryAuto?: (() => void) | undefined
  extraAction?: ReactNode | undefined
  className?: string | undefined
}

const failureHeadings: Record<PlaybackRecoveryViewModel['kind'], string> = {
  startup: 'Couldn’t start playback',
  interrupted: 'Playback was interrupted',
  external: 'This player couldn’t load',
}

const fallbackMessages: Record<PlaybackRecoveryViewModel['kind'], string> = {
  startup: 'We couldn’t start this title from the available sources.',
  interrupted: 'The current source stopped responding.',
  external: 'The provider player didn’t load.',
}

export function PlayerRecoveryPanel({ recovery, title, providerName, returnHref, onCancel, onChooseSource, onRetryAuto, extraAction, className }: PlayerRecoveryPanelProps) {
  const panel = useRef<HTMLDivElement>(null)
  const previousPhase = useRef(recovery.phase)
  const headingId = useId()
  const messageId = useId()
  const searching = recovery.phase === 'searching'
  const checked = recovery.progress
  const checkpoint = recovery.checkpointSeconds
  const checkpointLabel = typeof checkpoint === 'number' && checkpoint > 0
    ? `Your place at ${Math.floor(checkpoint / 60)}:${String(Math.floor(checkpoint % 60)).padStart(2, '0')} is saved.`
    : null

  useLayoutEffect(() => {
    const overlay = panel.current
    if (!overlay) return
    const player = overlay.closest<HTMLElement>('[data-consumit-player], [data-provider-frame]')
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const background = new Map<HTMLElement, boolean>()

    if (player) {
      let ancestor: HTMLElement | null = overlay
      while (ancestor && ancestor !== player) {
        const parent: HTMLElement | null = ancestor.parentElement
        if (!parent) break
        for (const sibling of parent.children) {
          if (sibling !== ancestor && sibling instanceof HTMLElement) {
            background.set(sibling, sibling.inert)
            sibling.inert = true
          }
        }
        ancestor = parent
      }
    }

    overlay.querySelector<HTMLElement>('[data-recovery-heading]')?.focus({ preventScroll: true })
    return () => {
      for (const [element, inert] of background) element.inert = inert
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    if (previousPhase.current === recovery.phase) return
    previousPhase.current = recovery.phase
    panel.current?.querySelector<HTMLElement>('[data-recovery-heading]')?.focus({ preventScroll: true })
  }, [recovery.phase])

  return (
    <div
      className={cn('consumit-player-recovery absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-canvas/85 p-4 backdrop-blur-[2px] sm:p-6', className)}
      data-player-recovery
      data-recovery-phase={recovery.phase}
      ref={panel}
    >
      <section
        aria-describedby={searching ? undefined : messageId}
        aria-labelledby={headingId}
        aria-modal="true"
        className="w-full min-w-0 max-w-xl rounded-control border border-border bg-surface/95 p-5 text-ink sm:p-7"
        data-recovery-card
        role={searching ? 'dialog' : 'alertdialog'}
        onKeyDown={event => {
          if (event.key !== 'Tab') return
          const overlay = panel.current
          const candidates = Array.from(overlay?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
            .filter(item => !item.closest('[hidden]'))
          const first = candidates[0]
          const last = candidates.at(-1)
          const active = document.activeElement

          if (!first || !last) {
            event.preventDefault()
            overlay?.querySelector<HTMLElement>('[data-recovery-heading]')?.focus({ preventScroll: true })
          } else if (event.shiftKey && (active === first || active === overlay?.querySelector('[data-recovery-heading]') || !overlay?.contains(active))) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && (active === last || !overlay?.contains(active))) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <div className="flex items-start gap-3.5" data-recovery-copy>
          <span aria-hidden="true" className={cn('mt-0.5 grid size-10 shrink-0 place-items-center rounded-control border', searching ? 'border-orange/25 bg-orange/10 text-orange' : 'border-border bg-surface-raised text-orange')}>
            {searching ? <LoaderCircle className="size-5 motion-safe:animate-spin motion-reduce:animate-none" /> : <CircleAlert className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Consumit Watch</p>
            <h2 className="mt-1 text-base font-semibold leading-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:text-xl" data-recovery-heading id={headingId} tabIndex={-1}>
              {searching ? (recovery.kind === 'startup' ? 'Finding a source' : 'Trying another source') : failureHeadings[recovery.kind]}
            </h2>
            <p className="mt-1 break-words text-xs leading-5 text-muted" title={title}>{title}</p>
            {providerName ? <p className="mt-1 truncate text-[11px] text-muted">Playback by {providerName}</p> : null}
            {searching ? (
              <p aria-atomic="true" aria-live="polite" className="mt-3 text-sm leading-6 text-copy" role="status">
                {checked ? `Checked ${checked.checked} of ${checked.total} sources.` : 'Checking configured sources.'}
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-copy" id={messageId}>{recovery.message ?? fallbackMessages[recovery.kind]}</p>
                {checkpointLabel ? <p className="mt-2 text-xs leading-5 text-muted">{checkpointLabel}</p> : null}
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col items-stretch gap-2.5 sm:flex-row sm:flex-wrap sm:items-center" data-recovery-actions>
          {searching ? (
            <>
              {onCancel ? <Button className="min-h-11 w-full sm:w-auto" size="md" variant="ghost" onClick={onCancel}>Cancel</Button> : null}
              {onChooseSource ? <Button className="min-h-11 w-full sm:w-auto" size="md" variant="secondary" onClick={onChooseSource}>Choose a source</Button> : null}
            </>
          ) : (
            <>
              {onRetryAuto ? <Button className="min-h-11 w-full sm:w-auto" size="md" onClick={onRetryAuto}>Try again with Auto</Button> : null}
              {onChooseSource ? <Button className="min-h-11 w-full sm:w-auto" size="md" variant="secondary" onClick={onChooseSource}>Choose a source</Button> : null}
              {returnHref ? <a className={cn(buttonVariants({ size: 'md', variant: 'ghost' }), 'min-h-11 w-full sm:w-auto')} href={returnHref}>Return to title</a> : null}
              {extraAction}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
