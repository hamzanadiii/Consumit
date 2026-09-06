import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { PreviewSessionProvider } from '@/app/session/preview-session'

function TestProviders({ children }: { children: ReactNode }) {
  return <PreviewSessionProvider>{children}</PreviewSessionProvider>
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: TestProviders, ...options })
}
