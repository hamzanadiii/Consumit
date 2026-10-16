import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { SessionProvider } from '@/app/session/session'
import { ShellStateProvider } from '@/app/home/shell-state'

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ShellStateProvider>{children}</ShellStateProvider>
    </SessionProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: TestProviders, ...options })
}
