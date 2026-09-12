'use client'

import type { CatalogKind } from '@consumit/contracts'
import { ArrowRight, Bookmark, Check, Eye, Heart, Link2, PenLine } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  getCachedMemberLibrary,
  getMemberLike,
  IdentityApiError,
  replaceCachedMemberLibrary,
  setMemberLiked,
  setMemberSaved,
  setMemberWatched,
} from '@/lib/identity-browser'

import { useSession } from '../session/session'
import { LogDialog } from './log-dialog'
import { RatingWidget } from './rating-widget'

type MemberActionPanelProps = {
  id: number
  kind: CatalogKind
  posterUrl?: string | undefined
  shareUrl?: string | undefined
  title: string
  year?: number | null | undefined
}

function legacyCopy(text: string) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'absolute'
  area.style.left = '-9999px'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  document.body.removeChild(area)
}

function ShelfToggle({ active, activeLabel, engagedLabel, fillClass, icon, inactiveLabel, onToggle, restLabel }: {
  active: boolean
  activeLabel: string
  engagedLabel: string
  fillClass: string
  icon: ReactNode
  inactiveLabel: string
  onToggle: () => void
  restLabel: string
}) {
  return (
    <button
      aria-label={active ? activeLabel : inactiveLabel}
      aria-pressed={active}
      className="group flex min-h-16 flex-1 flex-col items-center justify-center gap-1.5 rounded-control text-copy outline-none transition-all duration-150 hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset active:scale-[0.97] motion-reduce:transition-none motion-reduce:transform-none"
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className={active
          ? `text-orange transition-transform duration-150 group-hover:scale-110 group-active:scale-90 motion-reduce:transition-none motion-reduce:transform-none ${fillClass}`
          : 'transition-all duration-150 group-hover:scale-110 group-hover:text-ink group-active:scale-90 motion-reduce:transition-none motion-reduce:transform-none'}
      >
        {icon}
      </span>
      <span className="grid text-xs font-bold" aria-hidden="true">
        <span className="col-start-1 row-start-1 translate-y-0 opacity-100 transition-all duration-150 group-hover:-translate-y-1 group-hover:opacity-0 group-focus-visible:-translate-y-1 group-focus-visible:opacity-0 motion-reduce:transition-none motion-reduce:transform-none">
          {active ? engagedLabel : restLabel}
        </span>
        <span className="col-start-1 row-start-1 translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none motion-reduce:transform-none">
          {active ? 'Remove' : engagedLabel}
        </span>
      </span>
    </button>
  )
}

/**
 * Member shelf for title heroes: watched / liked / saved toggles with
 * real backing records, interactive rating, a native review composer, a
 * copy-link share row, and the library activity destination. Every row
 * reads or writes stored member data; nothing here is implied.
 */
export function MemberActionPanel({ id, kind, posterUrl, shareUrl, title, year }: MemberActionPanelProps) {
  const session = useSession()
  const [watched, setWatched] = useState(false)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareFailed, setShareFailed] = useState(false)
  const [logging, setLogging] = useState(false)
  const [logged, setLogged] = useState(false)

  useEffect(() => {
    if (!session.member) return
    let cancelled = false
    void getCachedMemberLibrary(session.member.id)
      .then((library) => {
        if (cancelled) return
        setWatched(library.watched.some((entry) => entry.kind === kind && entry.id === id))
        setSaved(library.saved.some((entry) => entry.kind === kind && entry.id === id))
      })
      .catch(() => {})
    void getMemberLike({ id, kind })
      .then((like) => {
        if (!cancelled) setLiked(like !== null)
      })
      .catch((cause) => {
        if (!cancelled && (!(cause instanceof IdentityApiError) || cause.status !== 404)) {
          setError('Your shelf could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [session.member, id, kind])

  async function toggle(slot: 'watched' | 'liked' | 'saved') {
    if (!session.member || busy) return
    setBusy(true)
    setError(null)
    if (slot === 'liked') {
      const next = !liked
      setLiked(next)
      try {
        await setMemberLiked({ id, kind }, next)
      } catch {
        setLiked(!next)
        setError('Your shelf could not be updated. Please retry.')
      } finally {
        setBusy(false)
      }
      return
    }
    const next = slot === 'watched' ? !watched : !saved
    if (slot === 'watched') setWatched(next)
    else setSaved(next)
    try {
      const library = slot === 'watched' ? await setMemberWatched({ id, kind }, next) : await setMemberSaved({ id, kind }, next)
      replaceCachedMemberLibrary(session.member.id, library)
    } catch {
      if (slot === 'watched') setWatched(!next)
      else setSaved(!next)
      setError('Your shelf could not be updated. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    const url = shareUrl ?? window.location.href
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      } else {
        legacyCopy(url)
      }
      setCopied(true)
      setShareFailed(false)
    } catch {
      setCopied(false)
      setShareFailed(true)
    }
  }

  return (
    <div className="rounded-card border border-border bg-canvas/70 p-5 backdrop-blur-md" data-consumit-member-shelf>
      {session.member ? (
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Your shelf for this title">
          <ShelfToggle
            active={watched}
            activeLabel={`Mark ${title} as not watched`}
            engagedLabel="Watched"
            fillClass="fill-orange/20"
            icon={<Eye aria-hidden="true" className="size-8" />}
            inactiveLabel={`Mark ${title} as watched`}
            onToggle={() => void toggle('watched')}
            restLabel="Watch"
          />
          <ShelfToggle
            active={liked}
            activeLabel={`Unlike ${title}`}
            engagedLabel="Liked"
            fillClass="fill-current"
            icon={<Heart aria-hidden="true" className="size-8" />}
            inactiveLabel={`Like ${title}`}
            onToggle={() => void toggle('liked')}
            restLabel="Like"
          />
          <ShelfToggle
            active={saved}
            activeLabel={`Remove ${title} from library`}
            engagedLabel="Saved"
            fillClass="fill-current"
            icon={<Bookmark aria-hidden="true" className="size-8" />}
            inactiveLabel={`Save ${title} to library`}
            onToggle={() => void toggle('saved')}
            restLabel="Save"
          />
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-orange" role="alert">{error}</p> : null}
      <p className="mt-4 border-t border-border pt-4 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted">Rated</p>
      <div className="mt-2">
        <RatingWidget id={id} kind={kind} title={title} />
      </div>
      <div className="mt-4 divide-y divide-border border-t border-border">
        {session.member ? (
          <button
            className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-bold text-copy outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset motion-reduce:transition-none"
            onClick={() => {
              setLogged(false)
              setLogging(true)
            }}
            type="button"
          >
            <PenLine aria-hidden="true" className="size-4" />
            Add review
          </button>
        ) : null}
        <button
          className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-bold text-copy outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset motion-reduce:transition-none"
          onClick={() => void share()}
          type="button"
        >
          {copied ? <Check aria-hidden="true" className="size-4 text-lime" /> : <Link2 aria-hidden="true" className="size-4" />}
          {copied ? 'Link copied' : 'Share'}
        </button>
        <Link
          className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-bold text-copy outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset motion-reduce:transition-none"
          href="/library"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
          Your activity
        </Link>
      </div>
      {logged ? <p className="mt-3 text-xs text-lime" role="status">Logged.</p> : null}
      {shareFailed ? <p className="mt-3 text-xs text-orange" role="alert">The link could not be copied.</p> : null}
      {/*
        * Portaled to document.body: the shelf's backdrop glass establishes a
        * containing block that would otherwise trap this fixed dialog inside
        * the card. `logging` only turns true from a client click, so this
        * never renders on the server.
        */}
      {logging
        ? createPortal(
          <LogDialog
            id={id}
            kind={kind}
            onClose={() => setLogging(false)}
            onSaved={() => {
              setLogging(false)
              setLogged(true)
            }}
            posterUrl={posterUrl}
            title={title}
            year={year}
          />,
          document.body,
        )
        : null}
    </div>
  )
}
