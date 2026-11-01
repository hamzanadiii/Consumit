'use client'

import { buttonVariants } from '@consumit/ui'

export function PersonalRatingsRetry({ failed = false, itemLabel = 'records', message, onRetry, retrying = false }: {
  failed?: boolean
  itemLabel?: 'records' | 'titles'
  message: string
  onRetry: () => void
  retrying?: boolean
}) {
  const status = retrying
    ? 'Retrying your personal rating lookup…'
    : failed
      ? `Personal ratings are still unavailable. Your ${itemLabel} and filters are unchanged.`
      : message

  return <div className="mt-3 flex flex-wrap items-center gap-3">
    <p className="text-xs text-[var(--fs-muted)]" role="status">{status}</p>
    <button className={`${buttonVariants({ variant: 'secondary' })} min-h-[44px]`} disabled={retrying} onClick={onRetry} type="button">
      {retrying ? 'Retrying rating lookup…' : 'Retry rating lookup'}
    </button>
  </div>
}
