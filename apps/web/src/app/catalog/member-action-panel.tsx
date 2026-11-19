'use client'

import { titleHref, type CatalogKind } from '@consumit/contracts'
import { ArrowRight, BookOpen, Bookmark, Check, Eye, Heart, Link2, PenLine, Send } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@consumit/ui'

import {
  getMemberTitleState,
  IdentityApiError,
  setMemberLiked,
  setMemberSaved,
  setMemberWatched,
} from '@/lib/identity-browser'

import { useSession } from '../session/session'
import { LogDialog, type LogDialogExistingReview } from './log-dialog'
import { AddTitleToList } from './add-title-to-list'
import { RatingWidget } from './rating-widget'
import { MEMBER_TITLE_ACTION_ICON_CLASS, MEMBER_TITLE_ACTION_ROW_CLASS } from './title-action-styles'
import { TitleRecommendationDialog } from '../taste/title-recommendation-dialog'

type MemberActionPanelProps = {
  id: number
  kind: CatalogKind
  posterUrl?: string | undefined
  shareUrl?: string | undefined
  title: string
  year?: number | null | undefined
}

type ShelfSlot = 'watched' | 'liked' | 'saved'

function shelfWriteFeedback(slot: ShelfSlot, value: boolean) {
  if (slot === 'watched') {
    return value
      ? { message: 'We could not confirm whether this title was marked watched.', retryLabel: 'Retry marking watched' }
      : { message: 'We could not confirm whether this title was removed from Watched.', retryLabel: 'Retry removing watched status' }
  }
  if (slot === 'liked') {
    return value
      ? { message: 'We could not confirm whether you liked this title.', retryLabel: 'Retry liking this title' }
      : { message: 'We could not confirm whether your like was removed.', retryLabel: 'Retry removing your like' }
  }
  return value
    ? { message: 'We could not confirm whether this title was saved to your library.', retryLabel: 'Retry saving to library' }
    : { message: 'We could not confirm whether this title was removed from your library.', retryLabel: 'Retry removing from library' }
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

function ShelfToggle({ active, activeLabel, buttonRef, disabled, engagedLabel, fillClass, icon, inactiveLabel, onToggle, restLabel }: {
  active: boolean
  activeLabel: string
  buttonRef: { current: HTMLButtonElement | null }
  disabled: boolean
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
      aria-disabled={disabled}
      className={active
        ? 'group flex min-h-[72px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control bg-orange/15 px-2 text-ink ring-1 ring-inset ring-orange/55 outline-none transition-colors hover:bg-orange/20 active:bg-orange/25 focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none aria-disabled:cursor-wait aria-disabled:opacity-60'
        : 'group flex min-h-[72px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control px-2 text-copy outline-none transition-colors hover:bg-white/5 hover:text-ink active:bg-white/10 focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none aria-disabled:cursor-wait aria-disabled:opacity-60'}
      onClick={() => { if (!disabled) onToggle() }}
      ref={buttonRef}
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
        {disabled ? <span className="col-start-1 row-start-1">{active ? engagedLabel : restLabel}</span> : <>
          <span className="col-start-1 row-start-1 translate-y-0 opacity-100 transition-[transform,opacity] duration-200 ease-out group-hover:-translate-y-1 group-hover:opacity-0 group-focus-visible:-translate-y-1 group-focus-visible:opacity-0 motion-reduce:transition-none motion-reduce:transform-none">
            {active ? engagedLabel : restLabel}
          </span>
          <span className="col-start-1 row-start-1 translate-y-1 opacity-0 transition-[transform,opacity] duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none motion-reduce:transform-none">
            {active ? 'Remove' : engagedLabel}
          </span>
        </>}
      </span>
    </button>
  )
}

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
  const activityHref = session.member
    ? `/profile/${encodeURIComponent(session.member.username)}/activity`
    : `/sign-in?next=${encodeURIComponent(titleHref({ id, kind }))}`
  const activityLabel = session.member ? 'Your activity' : 'Sign in to view your activity'
  const memberId = session.member?.id ?? null
  const identity = memberId ? `${memberId}:${kind}:${id}` : null
  const [watched, setWatched] = useState(false)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [review, setReview] = useState<LogDialogExistingReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null)
  const [retryingLoad, setRetryingLoad] = useState(false)
  const [retry, setRetry] = useState<{ kind: 'load' } | { kind: 'write'; slot: 'watched' | 'liked' | 'saved'; value: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareFailed, setShareFailed] = useState(false)
  const [logging, setLogging] = useState(false)
  const [composeMode, setComposeMode] = useState<'review' | 'log'>('review')
  const [logged, setLogged] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const watchedButtonRef = useRef<HTMLButtonElement>(null)
  const likedButtonRef = useRef<HTMLButtonElement>(null)
  const savedButtonRef = useRef<HTMLButtonElement>(null)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const focusAfterShelfWriteRef = useRef<ShelfSlot | null>(null)
  const focusAfterLoadRetryRef = useRef(false)
  const shelfLoading = identity !== null && (loadedIdentity !== identity || retryingLoad)
  const currentReview = loadedIdentity === identity && retry?.kind !== 'load' ? review : null
  const shelfDisabled = shelfLoading || busy || retry !== null

  useEffect(() => {
    if (!memberId || !identity) return
    let cancelled = false
    void getMemberTitleState({ id, kind })
      .then((state) => {
        if (!cancelled) {
          setLiked(state.like !== null)
          setSaved(state.saved)
          setWatched(state.watched)
          setReview(state.review ? { body: state.review.body, reviewId: state.review.reviewId, reviewedOn: state.review.reviewedOn } : null)
          setLoadedIdentity(identity)
          setError(null)
          setRetry(null)
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadedIdentity(identity)
          if (cause instanceof IdentityApiError && cause.status === 404) {
            setReview(null)
            setError(null)
            setRetry(null)
          } else {
            setError('Your shelf could not be loaded.')
            setRetry({ kind: 'load' })
          }
        }
      })
      .finally(() => { if (!cancelled) setRetryingLoad(false) })
    return () => {
      cancelled = true
    }
  }, [memberId, id, kind, identity, loadAttempt])

  useEffect(() => {
    if (busy || retryingLoad) return
    if (retry?.kind === 'write' || (retry?.kind === 'load' && focusAfterLoadRetryRef.current)) {
      retryButtonRef.current?.focus()
      return
    }
    if (retry) return
    if (focusAfterLoadRetryRef.current && identity && loadedIdentity === identity) {
      focusAfterLoadRetryRef.current = false
      watchedButtonRef.current?.focus()
      return
    }
    const slot = focusAfterShelfWriteRef.current
    if (!slot) return
    focusAfterShelfWriteRef.current = null
    if (slot === 'watched') watchedButtonRef.current?.focus()
    else if (slot === 'liked') likedButtonRef.current?.focus()
    else savedButtonRef.current?.focus()
  }, [busy, retry, retryingLoad, identity, loadedIdentity])

  async function updateShelf(slot: 'watched' | 'liked' | 'saved', next: boolean, isRetry = false) {
    if (!session.member || shelfLoading || busy || (!isRetry && retry !== null)) return
    const previous = slot === 'watched' ? watched : slot === 'liked' ? liked : saved
    setBusy(true)
    setError(null)
    setRetry(null)
    if (slot === 'watched') setWatched(next)
    else if (slot === 'liked') setLiked(next)
    else setSaved(next)
    try {
      if (slot === 'liked') {
        await setMemberLiked({ id, kind }, next)
      } else if (slot === 'watched') await setMemberWatched({ id, kind }, next)
      else await setMemberSaved({ id, kind }, next)
    } catch {
      if (slot === 'watched') setWatched(previous)
      else if (slot === 'liked') setLiked(previous)
      else setSaved(previous)
      setError(shelfWriteFeedback(slot, next).message)
      setRetry({ kind: 'write', slot, value: next })
    } finally {
      setBusy(false)
    }
  }

  function toggleShelf(slot: ShelfSlot, next: boolean) {
    focusAfterShelfWriteRef.current = slot
    void updateShelf(slot, next)
  }

  function retryShelf() {
    if (busy || shelfLoading || !retry) return
    if (retry.kind === 'load') {
      focusAfterLoadRetryRef.current = true
      setRetryingLoad(true)
      setError(null)
      setLoadAttempt(attempt => attempt + 1)
    } else {
      focusAfterShelfWriteRef.current = retry.slot
      void updateShelf(retry.slot, retry.value, true)
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
    <div className="rounded-card border border-border bg-surface p-4 text-ink" data-consumit-member-shelf>
      {session.member ? (
        <>
        {shelfLoading ? <p className="mb-2 text-xs text-[var(--fs-muted)]" role="status">Loading your shelf…</p> : null}
        <div aria-busy={shelfLoading || busy} className="grid grid-cols-3 gap-2" role="group" aria-label="Your shelf for this title">
          <ShelfToggle
            active={watched}
            activeLabel={`Mark ${title} as not watched`}
            buttonRef={watchedButtonRef}
            disabled={shelfDisabled}
            engagedLabel="Watched"
            fillClass="fill-current"
            icon={<Eye aria-hidden="true" className="size-6" />}
            inactiveLabel={`Mark ${title} as watched`}
            onToggle={() => toggleShelf('watched', !watched)}
            restLabel="Watch"
          />
          <ShelfToggle
            active={liked}
            activeLabel={`Unlike ${title}`}
            buttonRef={likedButtonRef}
            disabled={shelfDisabled}
            engagedLabel="Liked"
            fillClass="fill-current"
            icon={<Heart aria-hidden="true" className="size-6" />}
            inactiveLabel={`Like ${title}`}
            onToggle={() => toggleShelf('liked', !liked)}
            restLabel="Like"
          />
          <ShelfToggle
            active={saved}
            activeLabel={`Remove ${title} from library`}
            buttonRef={savedButtonRef}
            disabled={shelfDisabled}
            engagedLabel="Saved"
            fillClass="fill-current"
            icon={<Bookmark aria-hidden="true" className="size-6" />}
            inactiveLabel={`Save ${title} to library`}
            onToggle={() => toggleShelf('saved', !saved)}
            restLabel="Save"
          />
        </div>
        </>
      ) : null}
      {busy ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Saving your shelf…</p> : null}
      {error ? <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs text-danger" role="alert">{error}</p>{retry ? <Button aria-disabled={busy || shelfLoading} className="min-h-[44px] aria-disabled:cursor-wait aria-disabled:opacity-60" onClick={retryShelf} ref={retryButtonRef} size="sm" variant="ghost">{retry.kind === 'load' ? 'Retry shelf' : shelfWriteFeedback(retry.slot, retry.value).retryLabel}</Button> : null}</div> : null}
      <div className="mt-3 rounded-control border border-border bg-surface-raised p-3.5">
        <p className="text-sm font-bold text-ink">Your rating</p>
        <div className="mt-2">
          <RatingWidget id={id} kind={kind} title={title} />
        </div>
      </div>
      <div className="mt-3 grid gap-1 border-t border-border pt-3">
        {session.member ? (
          <button
            className={MEMBER_TITLE_ACTION_ROW_CLASS}
            disabled={shelfLoading || retry?.kind === 'load'}
            onClick={() => {
              setLogged(false)
              setComposeMode('review')
              setLogging(true)
            }}
            type="button"
          >
            <span aria-hidden="true" className={MEMBER_TITLE_ACTION_ICON_CLASS}>
              <PenLine aria-hidden="true" className="size-[18px]" />
            </span>
            {currentReview ? 'Edit review' : 'Add review'}
          </button>
        ) : null}
        {session.member ? <button type="button" className={MEMBER_TITLE_ACTION_ROW_CLASS} onClick={() => { setLogged(false); setComposeMode('log'); setLogging(true) }}><span aria-hidden="true" className={MEMBER_TITLE_ACTION_ICON_CLASS}><BookOpen className="size-[18px]" /></span>Log a watch</button> : null}
        {session.member ? <button type="button" className={MEMBER_TITLE_ACTION_ROW_CLASS} onClick={() => setRecommending(true)}><span aria-hidden="true" className={MEMBER_TITLE_ACTION_ICON_CLASS}><Send className="size-[18px]" /></span>Recommend to someone</button> : null}
        {session.member ? <AddTitleToList posterUrl={posterUrl} title={{ id, kind }} titleName={title} /> : null}
        <button
          className={MEMBER_TITLE_ACTION_ROW_CLASS}
          onClick={() => void share()}
          type="button"
        >
          <span aria-hidden="true" className={MEMBER_TITLE_ACTION_ICON_CLASS}>
            {copied ? <Check aria-hidden="true" className="size-[18px] text-orange" /> : <Link2 aria-hidden="true" className="size-[18px]" />}
          </span>
          {copied ? 'Link copied' : 'Share'}
        </button>
        <Link
          className={MEMBER_TITLE_ACTION_ROW_CLASS}
          href={activityHref}
        >
          <span aria-hidden="true" className={MEMBER_TITLE_ACTION_ICON_CLASS}>
            <ArrowRight aria-hidden="true" className="size-[18px]" />
          </span>
          {activityLabel}
        </Link>
      </div>
      {logged ? <p className="mt-3 text-xs font-bold text-lime" role="status">{composeMode === 'review' ? 'Review published.' : 'Watch logged.'}</p> : null}
      {shareFailed ? <p className="mt-3 text-xs text-danger" role="alert">The link could not be copied.</p> : null}
      {/*
        * Portaled to document.body so the dialog stays viewport-fixed and
        * above the title art. `logging` only turns true from a client click,
        * so this never renders on the server.
        */}
      {logging
        ? createPortal(
          <LogDialog
            mode={composeMode}
            id={id}
            kind={kind}
            existingReview={composeMode === 'review' ? currentReview : null}
            onClose={() => setLogging(false)}
            onSaved={publishedReview => {
              if (publishedReview) setReview(publishedReview)
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
      {recommending && session.member ? <TitleRecommendationDialog id={id} kind={kind} title={title} onClose={() => setRecommending(false)} /> : null}
    </div>
  )
}
