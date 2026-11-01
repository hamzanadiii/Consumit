'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { THEME_STORAGE_KEY, type FilScreenTheme } from '../home/filscreen-theme'

type ProfileEditorDialogProps = {
  children: ReactNode
  description?: string | undefined
  eyebrow: string
  footer: ReactNode
  labelledBy: string
  maxWidthClassName?: string | undefined
  onClose: () => void
  title: string
}

/**
 * Shared FilScreen modal shell for the profile editors. Portaled to
 * `document.body` so page glass never traps the fixed overlay, and wrapped
 * in the FilScreen theme scope so `--fs-*` tokens resolve outside the page
 * shell. Escape, backdrop click, and the close action dismiss; Tab cycles
 * inside the panel and the page behind stops scrolling while open.
 */
export function ProfileEditorDialog({ children, description, eyebrow, footer, labelledBy, maxWidthClassName = 'max-w-3xl', onClose, title }: ProfileEditorDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [theme, setTheme] = useState<FilScreenTheme>('dark')

  // Mount-only sync of the device-stored FilScreen theme (external store),
  // matching the shell's pre-paint script. Direct setState in this effect is
  // intentional.
  useEffect(() => {
    let next: FilScreenTheme | null = null
    try {
      if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') next = 'light'
    } catch {
      // Storage denial keeps the dark default.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only external-store sync
    if (next) setTheme(next)
  }, [])

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
    if (!panel.contains(document.activeElement)) {
      const preferred = panel.querySelector<HTMLElement>('[data-initial-focus]')
      ;(preferred ?? focusable()[0])?.focus({ preventScroll: true })
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (controls.length === 0) {
        event.preventDefault()
        panel!.focus({ preventScroll: true })
        return
      }
      const first = controls[0]!
      const last = controls[controls.length - 1]!
      if (event.shiftKey && (document.activeElement === first || !panel!.contains(document.activeElement))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (document.activeElement === last || !panel!.contains(document.activeElement))) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [])

  // Portals only exist in the browser; the server render stays empty.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div data-filscreen-home data-theme={theme} style={{ colorScheme: theme }}>
      <div
        className="fs-profile-editor-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          aria-labelledby={labelledBy}
          aria-modal="true"
          className={`fs-profile-editor-panel my-0 flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--fs-field-border)] bg-[var(--fs-shell)] shadow-2xl ${maxWidthClassName}`}
          ref={panelRef}
          role="dialog"
          tabIndex={-1}
          data-filscreen-profile-dialog
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--fs-line)] p-5 sm:p-6">
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.18em] text-[var(--fs-muted)] uppercase">{eyebrow}</p>
              <h2 className="mt-1.5 font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl" id={labelledBy}>
                {title}
              </h2>
              {description ? <p className="mt-1.5 text-xs leading-5 text-[var(--fs-muted)]">{description}</p> : null}
            </div>
            <button
              aria-label={`Close ${title.toLowerCase()} dialog`}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-[var(--fs-muted)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {children}
          </div>
          <div className="shrink-0 border-t border-[var(--fs-line)] bg-[var(--fs-shell)] p-5 sm:p-6">
            {footer}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
