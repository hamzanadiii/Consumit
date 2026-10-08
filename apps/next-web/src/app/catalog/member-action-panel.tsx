'use client'

import type { CatalogKind } from '@consumit/contracts'
import { ArrowRight, Bookmark, Check, Eye, Heart, Link2, PenLine } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  getMemberTitleState,
  IdentityApiError,
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
      className={active
        ? 'group flex min-h-[72px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control bg-orange/15 px-2 text-ink ring-1 ring-inset ring-orange/55 outline-none transition-colors hover:bg-orange/20 active:bg-orange/25 focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none'
        : 'group flex min-h-[72px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control px-2 text-copy outline-none transition-colors hover:bg-white/5 hover:text-ink active:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none'}
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className={active
          ? `text-orange ${fillClass}`
          : 'text-muted transition-colors group-hover:text-ink motion-reduce:transition-none'}
      >
        {icon}
      </span>
      <span className="grid text-xs font-bold" aria-hidden="true">
        <span className="col-start-1 row-start-1 translate-y-0 opacity-100 transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:opacity-0 group-focus-visible:-translate-y-1 group-focus-visible:opacity-0 motion-reduce:transition-none motion-reduce:transform-none">
          {active ? engagedLabel : restLabel}
        </span>
        <span className="col-start-1 row-start-1 translate-y-1 opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none motion-reduce:transform-none">
          {active ? 'Remove' : engagedLabel}
        </span>
      </span>
    </button>
  )
}

const SHELF_ROW_CLASS =
  'group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-sm font-semibold text-copy outline-none transition-colors hover:bg-white/5 hover:text-ink active:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none'

const SHELF_ICON_CLASS =
  'grid place-items-center text-muted transition-colors group-hover:text-ink motion-reduce:transition-none'

/**
 * Member shelf for title heroes: watched / liked / saved toggles with
 * real backing records, interactive rating, a native review composer, a
 * copy-link share row, and the library activity destination. Every row
 * reads or writes stored member data; nothing here is implied.
 *
 * The shelf stays inside the cinematic title hero but uses the same solid
 * midnight surfaces and signal-orange decisions as the rest of Consumit.
 * Its readable surface does not depend on backdrop blur or theme-specific art.
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
    void getMemberTitleState({ id, kind })
      .then((state) => {
        if (!cancelled) {
          setLiked(state.like !== null)
          setSaved(state.saved)
          setWatched(state.watched)
        }
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
      if (slot === 'watched') await setMemberWatched({ id, kind }, next)
      else await setMemberSaved({ id, kind }, next)
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
    <div className="rounded-card border border-border bg-nav p-4 text-ink" data-consumit-member-shelf>
      {session.member ? (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your shelf for this title">
          <ShelfToggle
            active={watched}
            activeLabel={`Mark ${title} as not watched`}
            engagedLabel="Watched"
            fillClass="fill-current"
            icon={<Eye aria-hidden="true" className="size-6" />}
            inactiveLabel={`Mark ${title} as watched`}
            onToggle={() => void toggle('watched')}
            restLabel="Watch"
          />
          <ShelfToggle
            active={liked}
            activeLabel={`Unlike ${title}`}
            engagedLabel="Liked"
            fillClass="fill-current"
            icon={<Heart aria-hidden="true" className="size-6" />}
            inactiveLabel={`Like ${title}`}
            onToggle={() => void toggle('liked')}
            restLabel="Like"
          />
          <ShelfToggle
            active={saved}
            activeLabel={`Remove ${title} from library`}
            engagedLabel="Saved"
            fillClass="fill-current"
            icon={<Bookmark aria-hidden="true" className="size-6" />}
            inactiveLabel={`Save ${title} to library`}
            onToggle={() => void toggle('saved')}
            restLabel="Save"
          />
        </div>
      ) : null}
      {error ? <p className="mt-3 text-xs text-danger" role="alert">{error}</p> : null}
      <div className="mt-3 rounded-control border border-border bg-surface p-3.5">
        <p className="text-sm font-bold text-ink">Your rating</p>
        <div className="mt-2">
          <RatingWidget id={id} kind={kind} title={title} />
        </div>
      </div>
      <div className="mt-3 grid gap-1 border-t border-border pt-3">
        {session.member ? (
          <button
            className={SHELF_ROW_CLASS}
            onClick={() => {
              setLogged(false)
              setLogging(true)
            }}
            type="button"
          >
            <span aria-hidden="true" className={SHELF_ICON_CLASS}>
              <PenLine aria-hidden="true" className="size-[18px]" />
            </span>
            Add review
          </button>
        ) : null}
        <button
          className={SHELF_ROW_CLASS}
          onClick={() => void share()}
          type="button"
        >
          <span aria-hidden="true" className={SHELF_ICON_CLASS}>
            {copied ? <Check aria-hidden="true" className="size-[18px] text-orange" /> : <Link2 aria-hidden="true" className="size-[18px]" />}
          </span>
          {copied ? 'Link copied' : 'Share'}
        </button>
        <Link
          className={SHELF_ROW_CLASS}
          href={session.member ? `/profile/${encodeURIComponent(session.member.username)}/activity` : '/sign-in'}
        >
          <span aria-hidden="true" className={SHELF_ICON_CLASS}>
            <ArrowRight aria-hidden="true" className="size-[18px]" />
          </span>
          Your activity
        </Link>
      </div>
      {logged ? <p className="mt-3 text-xs font-bold text-lime" role="status">Logged.</p> : null}
      {shareFailed ? <p className="mt-3 text-xs text-danger" role="alert">The link could not be copied.</p> : null}
      {/*
        * Portaled to document.body so the dialog stays viewport-fixed and
        * above the title art. `logging` only turns true from a client click,
        * so this never renders on the server.
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
