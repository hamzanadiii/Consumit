'use client'

import type { ReactNode } from 'react'
import type { LenisOptions } from 'lenis'
import { ReactLenis } from 'lenis/react'

const LENIS_OPTIONS: LenisOptions = {
  allowNestedScroll: true,
  anchors: true,
  autoRaf: true,
  respectReducedMotion: true,
  smoothWheel: true,
  stopInertiaOnNavigate: true,
  syncTouch: false,
}

export function LenisProvider({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={LENIS_OPTIONS}>
      {children}
    </ReactLenis>
  )
}
