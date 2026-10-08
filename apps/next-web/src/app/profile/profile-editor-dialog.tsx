'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useShellState } from '../home/shell-state'

type ProfileEditorDialogProps = {
  children: ReactNode
  description?: string | undefined
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
export function ProfileEditorDialog({ children, description, footer, labelledBy, maxWidthClassName = 'max-w-3xl', onClose, title }: ProfileEditorDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { theme } = useShellState()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button, textarea, input, select, [href]')]
        .filter((element) => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  // Portals only exist in the browser; the server render stays empty.
  if (typeof document === 'undefined') return null

  return createPortal(
    <div data-filscreen-home data-theme={theme} style={{ colorScheme: theme }}>
      <div
        className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          aria-labelledby={labelledBy}
          aria-modal="true"
          className={`my-8 flex max-h-[calc(100vh-4rem)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--fs-field-border)] bg-[var(--fs-shell)] shadow-2xl ${maxWidthClassName}`}
          ref={panelRef}
          role="dialog"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--fs-line)] p-5 sm:p-6">
            <div className="min-w-0">
              <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl" id={labelledBy}>
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
