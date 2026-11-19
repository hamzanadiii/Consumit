'use client'

import { useEffect, useRef } from 'react'

export function SkipToContent() {
  const link = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    function focusSkipLinkWhenEnteringPage(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.shiftKey || event.defaultPrevented) return
      const activeElement = document.activeElement
      const routeEntryHeading = activeElement instanceof HTMLElement && activeElement.hasAttribute('data-consumit-skip-on-entry')
      if (activeElement !== document.body && !routeEntryHeading) return

      event.preventDefault()
      if (routeEntryHeading) activeElement.removeAttribute('data-consumit-skip-on-entry')
      link.current?.focus({ preventScroll: true })
    }

    document.addEventListener('keydown', focusSkipLinkWhenEnteringPage, true)
    return () => document.removeEventListener('keydown', focusSkipLinkWhenEnteringPage, true)
  }, [])

  return (
    <a className="consumit-skip-link" href="#consumit-main-content" ref={link}>
      Skip to main content
    </a>
  )
}
