'use client'

import type { CatalogKind } from '@consumit/contracts'
import { ArrowRight, Bookmark, Check, Eye, Heart, Link2, PenLine } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  getCachedMemberLibrary,
  getMemberTitleState,
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
      className={active
        ? 'group flex min-h-[76px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl bg-[rgba(255,93,56,0.16)] px-2 text-white shadow-[inset_0_0_0_1px_rgba(255,93,56,0.55)] outline-none transition-all duration-200 ease-out hover:-translate-y-px hover:bg-[rgba(255,93,56,0.24)] active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none motion-reduce:transform-none'
        : 'group flex min-h-[76px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl px-2 text-white/65 outline-none transition-all duration-200 ease-out hover:-translate-y-px hover:bg-white/10 hover:text-white active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none motion-reduce:transform-none'}
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className={active
          ? `text-[#ff5d38] transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-95 motion-reduce:transition-none motion-reduce:transform-none ${fillClass}`
          : 'transition-all duration-200 ease-out group-hover:scale-110 group-hover:text-white group-active:scale-95 motion-reduce:transition-none motion-reduce:transform-none'}
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
  'group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-white/80 outline-none transition-all duration-200 ease-out hover:-translate-y-px hover:bg-white/10 hover:text-white active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none motion-reduce:transform-none'

const SHELF_ICON_CLASS =
  'grid place-items-center text-white/50 transition-all duration-200 ease-out group-hover:scale-110 group-hover:text-white motion-reduce:transition-none motion-reduce:transform-none'

/**
 * Member shelf for title heroes: watched / liked / saved toggles with
 * real backing records, interactive rating, a native review composer, a
 * copy-link share row, and the library activity destination. Every row
 * reads or writes stored member data; nothing here is implied.
 *
 * The shelf lives inside the dark cinematic title hero, so it speaks the
 * FilScreen row language (rounded-xl hover-lift rows, accent-soft actives,
 * white focus rings) in fixed dark-glass tones that stay legible over
 * backdrop art in either theme.
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
    void getMemberTitleState({ id, kind })
      .then((state) => {
        if (!cancelled) setLiked(state.like !== null)
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
    <div className="rounded-2xl border border-white/10 bg-[rgba(18,18,22,0.72)] p-4 text-[#f4f0e8] backdrop-blur-md" data-consumit-member-shelf>
      {session.member ? (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your shelf for this title">
          <ShelfToggle
            active={watched}
            activeLabel={`Mark ${title} as not watched`}
            engagedLabel="Watched"
            fillClass="fill-[#ff5d38]/20"
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
      {error ? <p className="mt-3 text-xs text-orange" role="alert">{error}</p> : null}
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <p className="text-sm font-bold text-white">Your rating</p>
        <div className="mt-2">
          <RatingWidget id={id} kind={kind} title={title} />
        </div>
      </div>
      <div className="mt-3 grid gap-1 border-t border-white/10 pt-3">
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
            {copied ? <Check aria-hidden="true" className="size-[18px] text-[#ff5d38]" /> : <Link2 aria-hidden="true" className="size-[18px]" />}
          </span>
          {copied ? 'Link copied' : 'Share'}
        </button>
        <Link
          className={SHELF_ROW_CLASS}
          href="/library"
        >
          <span aria-hidden="true" className={SHELF_ICON_CLASS}>
            <ArrowRight aria-hidden="true" className="size-[18px]" />
          </span>
          Your activity
        </Link>
      </div>
      {logged ? <p className="mt-3 text-xs font-bold text-[#ff5d38]" role="status">Logged.</p> : null}
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
