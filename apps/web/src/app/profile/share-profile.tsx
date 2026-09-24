'use client'

import { Check, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Profile right-rail share row: copies the public profile URL to the
 * clipboard and confirms with a short, announced success state.
 */
export function ShareProfile({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    const url = `${window.location.origin}/profile/${username}`
    setFailed(false)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        return
      }
      throw new Error('clipboard unavailable')
    } catch {
      setFailed(true)
    }
  }

  return (
    <section aria-labelledby="share-profile-heading" className="rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4 sm:p-5" data-consumit-share-profile>
      <h2 className="text-sm font-bold text-[var(--fs-ink)]" id="share-profile-heading">Share this profile</h2>
      <button
        className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-4 text-xs font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-accent)]/60 hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none"
        onClick={() => void copy()}
        type="button"
      >
        {copied ? <Check aria-hidden="true" className="size-4 text-[var(--fs-accent)]" /> : <Link2 aria-hidden="true" className="size-4" />}
        {copied ? 'Link copied' : 'Copy profile link'}
      </button>
      {failed ? (
        <p className="mt-2 text-xs text-[var(--fs-danger)]" role="alert">
          The link could not be copied. Select the address bar instead.
        </p>
      ) : null}
      <p className="sr-only" role="status">{copied ? 'Profile link copied to clipboard.' : ''}</p>
    </section>
  )
}
