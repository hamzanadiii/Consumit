'use client'

import { useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import type { WebVitalEvent } from '@consumit/contracts'
import { sendWebVital, webVitalPageForPath } from '@/lib/web-vitals'
import { observeClientErrors } from '@/lib/client-errors'

export function WebVitals() {
  const pathname = usePathname() ?? '/'
  const page = webVitalPageForPath(pathname)
  useEffect(() => observeClientErrors(pathname), [pathname])
  const report = useCallback((metric: { name: string; value: number }) => {
    if (pathname.startsWith('/_internal/')) return
    if (!['CLS', 'FCP', 'INP', 'LCP', 'TTFB'].includes(metric.name)) return
    sendWebVital({ metric: metric.name as WebVitalEvent['metric'], page, value: metric.value })
  }, [page, pathname])

  useReportWebVitals(report)
  return null
}
