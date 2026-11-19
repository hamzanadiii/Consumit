'use client'

import { ArrowLeft, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { Button, buttonVariants, ErrorState } from '@consumit/ui'

import { FilScreenShell } from '../../../home/filscreen-shell'

const sectionLabels: Record<string, string> = {
  activity: 'Activity',
  diary: 'Diary',
  films: 'Watched films',
  followers: 'Followers',
  following: 'Following',
  history: 'Watch history',
  likes: 'Likes',
  lists: 'Lists',
  network: 'Network',
  ratings: 'Ratings',
  reviews: 'Reviews',
  tags: 'Tags',
  watchlist: 'Watchlist',
}

export default function ProfileArchiveError({ error, retry }: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const { section, username } = useParams<{ section: string; username: string }>()
  const main = useRef<HTMLElement>(null)

  useEffect(() => { console.error(error) }, [error])
  useLayoutEffect(() => { main.current?.focus({ preventScroll: true }) }, [])

  const sectionLabel = sectionLabels[section] ?? 'this section'
  const profileHref = `/profile/${encodeURIComponent(username)}`

  return (
    <FilScreenShell pageHeading={undefined}>
      <main
        id="consumit-main-content"
        ref={main}
        tabIndex={-1}
        className="mx-auto flex min-h-[60vh] w-full max-w-[90rem] items-center px-4 py-10 focus:outline-none"
      >
        <ErrorState
          action={(
            <div className="flex flex-wrap gap-3">
              <Button className="min-h-11" onClick={retry}><RotateCcw aria-hidden="true" /> Try again</Button>
              <Link className={`${buttonVariants({ variant: 'secondary' })} min-h-11`} href={profileHref}><ArrowLeft aria-hidden="true" /> Back to profile</Link>
            </div>
          )}
          className="mx-auto w-full max-w-2xl"
          description={`Try again, or return to @${username}’s profile.`}
          detail={error.digest ? `Reference: ${error.digest}` : undefined}
          headingLevel={1}
          title={`We couldn’t load ${sectionLabel} right now`}
        />
      </main>
    </FilScreenShell>
  )
}
