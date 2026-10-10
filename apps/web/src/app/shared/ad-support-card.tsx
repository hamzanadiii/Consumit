'use client'

import { useState } from 'react'
import { Button } from '@consumit/ui'
import { X } from 'lucide-react'
import styles from './ad-support-card.module.css'

const DISMISS_KEY = 'consumit.ads.support-card-dismissed'

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Explains why Consumit shows advertisements: ad revenue pays for the
 * servers, bandwidth, and catalog data that keep the app free. Dismissal
 * is remembered per device.
 */
export function AdSupportCard() {
  const [hidden, setHidden] = useState<boolean | null>(null)
  const isDismissed = hidden ?? dismissed()
  if (isDismissed) return null

  function dismiss() {
    setHidden(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true')
    } catch { /* Dismissal for this visit still holds via state. */ }
  }

  return (
    <section aria-labelledby="ad-support-heading" className={styles.card} data-ad-support-card>
      <Button aria-label="Hide this message" className={styles.dismiss} onClick={dismiss} size="sm" type="button" variant="ghost">
        <X aria-hidden="true" />
      </Button>
      <h2 className={styles.heading} id="ad-support-heading">Ads keep Consumit running</h2>
      <p className={styles.body}>
        The advertisements you see here pay for Consumit&rsquo;s servers, bandwidth, and catalog data. That is what keeps the app free and every stream loading smoothly. Thank you for watching with us.
      </p>
    </section>
  )
}
