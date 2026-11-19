'use client'

import type { CatalogKind } from '@consumit/contracts'
import { titleHref, watchHref } from '@consumit/contracts'
import { Bookmark, Check, Ellipsis, Eye, Heart, ListPlus, Play, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { clearMemberRating, getMemberTitleState, setMemberLiked, setMemberRating, setMemberSaved, setMemberWatched } from '@/lib/identity-browser'
import { RatingInput } from '@consumit/ui'
import { useOptionalSession } from '../session/session'
import { AddTitleToListDialog, AddTitleToListTrigger } from '../catalog/add-title-to-list'
import { TITLE_CARD_ACTION_ROW_CLASS } from '../catalog/title-action-styles'

const PORTAL_THEME_TOKENS = [
  '--fs-ink', '--fs-secondary', '--fs-muted', '--fs-line', '--fs-field', '--fs-field-border', '--fs-rail', '--fs-focus', '--fs-accent', '--fs-accent-soft', '--fs-hover',
  '--consumit-surface', '--consumit-surface-raised', '--consumit-field', '--consumit-ink', '--consumit-copy', '--consumit-muted', '--consumit-orange', '--consumit-border',
  '--color-surface', '--color-surface-raised', '--color-field', '--color-ink', '--color-copy', '--color-muted', '--color-orange', '--color-border',
] as const

function portalThemeStyle(shell: HTMLElement | null): CSSProperties {
  const computed = getComputedStyle(shell ?? document.documentElement)
  const entries = PORTAL_THEME_TOKENS
    .map(token => [token, computed.getPropertyValue(token).trim()] as const)
    .filter(([, value]) => Boolean(value))
  return Object.fromEntries(entries) as CSSProperties
}

export function TitleCardQuickActions({ id, kind, posterUrl, title, variant = 'card', initialAction }: { id: number; kind: CatalogKind; posterUrl?: string | null | undefined; title: string; variant?: 'card' | 'details'; initialAction?: 'list' | 'rate' }) {
  const session = useOptionalSession()
  const member = session?.member ?? null
  const sessionStatus = session?.status ?? 'anonymous'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(() => Boolean(member && initialAction === 'rate'))
  const [listPickerOpen, setListPickerOpen] = useState(() => Boolean(member && initialAction === 'list'))
  const listPickerWasOpen = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; mobile: boolean; theme: CSSProperties } | null>(null)
  const [state, setState] = useState({ saved: false, watched: false, liked: false, rating: null as number | null })
  const [loading, setLoading] = useState(() => Boolean(member && initialAction === 'rate'))
  const [busy, setBusy] = useState(false)
  const [ratingBusy, setRatingBusy] = useState(false)
  const [ratingOpen, setRatingOpen] = useState(() => Boolean(member && initialAction === 'rate'))
  const [undoKey, setUndoKey] = useState<'saved' | 'watched' | 'liked' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const destination = titleHref({ id, kind })
  const playback = watchHref({ id, kind })

  useEffect(() => {
    if (listPickerWasOpen.current && !listPickerOpen) triggerRef.current?.focus()
    listPickerWasOpen.current = listPickerOpen
  }, [listPickerOpen])

  useEffect(() => {
    if (!open || !member) return
    let cancelled = false
    void getMemberTitleState({ id, kind }).then((value) => {
      if (cancelled) return
      setState({ saved: value.saved, watched: value.watched, liked: Boolean(value.like), rating: value.rating?.value ?? null })
    }).catch(() => {
      if (!cancelled) setMessage('Your saved actions could not load. Try closing and reopening this menu.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, kind, open, member])

  useEffect(() => {
    if (!open) return
    const focusFrame = window.requestAnimationFrame(() => {
      const selector = ratingOpen ? 'input[type="radio"]:checked, input[type="radio"]' : 'button:not(:disabled), a[href]'
      panelRef.current?.querySelector<HTMLElement>(selector)?.focus()
    })
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const shell = triggerRef.current?.closest<HTMLElement>('[data-filscreen-home]') ?? null
      const mobile = window.matchMedia?.('(max-width: 639px)').matches ?? false
      const width = mobile ? window.innerWidth - 24 : Math.min(272, window.innerWidth - 24)
      const left = mobile ? 12 : Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
      const maxPanelHeight = mobile ? Math.min(560, window.innerHeight * 0.72) : Math.min(440, window.innerHeight - 24)
      const preferredTop = rect.bottom + 8
      const spaceBelow = window.innerHeight - preferredTop - 12
      const estimatedPanelHeight = member ? 450 : 330
      const panelHeight = Math.min(estimatedPanelHeight, maxPanelHeight)
      const opensAbove = !mobile && spaceBelow < panelHeight
      const top = mobile ? Math.max(12, window.innerHeight - panelHeight - 12) : opensAbove ? Math.max(12, rect.top - panelHeight - 8) : Math.max(12, preferredTop)
      setPosition({ left, top, width, maxHeight: Math.min(maxPanelHeight, window.innerHeight - top - 12), mobile, theme: portalThemeStyle(shell) })
    }
    const close = () => { setOpen(false); triggerRef.current?.focus() }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')
        if (!focusable?.length) return
        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close()
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, member, ratingOpen])

  async function toggle(key: 'saved' | 'watched' | 'liked') {
    if (busy) return
    const next = !state[key]
    setBusy(true)
    setMessage(null)
    try {
      if (key === 'saved') await setMemberSaved({ id, kind }, next)
      if (key === 'watched') await setMemberWatched({ id, kind }, next)
      if (key === 'liked') await setMemberLiked({ id, kind }, next)
      setState(current => ({ ...current, [key]: next }))
      setUndoKey(key)
      setMessage(next ? `${title} added to your ${key === 'saved' ? 'Watchlist' : key === 'watched' ? 'Watched' : 'Likes'}.` : `${title} removed from your ${key === 'saved' ? 'Watchlist' : key === 'watched' ? 'Watched' : 'Likes'}.`)
    } catch {
      setMessage(`Could not update ${title}. Try again.`)
    } finally { setBusy(false) }
  }

  async function rate(value: number | null) {
    if (ratingBusy) return
    setRatingBusy(true); setMessage(null)
    try {
      if (value === null) await clearMemberRating({ id, kind })
      else await setMemberRating({ id, kind }, value)
      setState(current => ({ ...current, rating: value }))
      setMessage(value === null ? 'Rating removed.' : `Rated ${value / 2} out of 5 stars.`)
    } catch { setMessage('Your rating could not be saved. Try again.') }
    finally { setRatingBusy(false) }
  }

  async function undo() {
    if (!undoKey || busy) return
    const key = undoKey
    setUndoKey(null)
    await toggle(key)
    setUndoKey(null)
  }

  const signInHref = (action: string) => `/sign-in?next=${encodeURIComponent(`${destination}?consumitAction=${action}`)}`

  const actionClass = TITLE_CARD_ACTION_ROW_CLASS

  function toggleMenu() {
    const nextOpen = !open
    if (nextOpen && member) {
      setLoading(true)
      setMessage(null)
      setUndoKey(null)
      setRatingOpen(false)
    }
    setOpen(nextOpen)
  }

  return <>
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={variant === 'details' ? `Title actions for ${title}` : `More actions for ${title}`}
      className={variant === 'details'
        ? 'inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none hover:border-[var(--fs-accent)] hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
        : 'group relative grid size-11 cursor-pointer place-items-center rounded-full text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'}
      onClick={toggleMenu}
      ref={triggerRef}
      type="button"
    >
      {variant === 'details'
        ? <><Ellipsis aria-hidden="true" className="size-4" />Title actions</>
        : <><span aria-hidden="true" className="absolute inset-[5px] rounded-full border border-[var(--fs-line)] bg-[var(--fs-shell)] shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur-sm transition-[background-color,border-color,box-shadow,transform] duration-150 group-hover:scale-105 group-hover:border-[var(--fs-accent)] group-hover:bg-[var(--fs-accent-soft)] group-hover:shadow-[0_0_0_3px_var(--fs-accent-soft)] motion-reduce:transition-none" /><Ellipsis aria-hidden="true" className="relative size-4 stroke-[2.5] transition-colors group-hover:text-[var(--fs-accent)]" /></>}
    </button>
    {open && typeof document !== 'undefined' ? createPortal(
      <>
      {position?.mobile ? <button aria-label="Close title actions" className="fixed inset-0 z-[99] bg-black/55" onClick={() => { setOpen(false); triggerRef.current?.focus() }} type="button" /> : null}
      <div
        aria-label={`${title} actions`}
        aria-modal={position?.mobile ? true : undefined}
        className={`fixed z-[100] overflow-y-auto border border-[var(--fs-line)] bg-[var(--consumit-surface-raised)] p-2 text-[var(--fs-ink)] shadow-[0_12px_32px_rgba(0,0,0,0.28)] ${position?.mobile ? 'rounded-[20px]' : 'rounded-card'}`}
        ref={panelRef}
        role="dialog"
        style={position ? { ...position.theme, left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, scrollbarColor: 'var(--fs-muted) transparent', scrollbarWidth: 'thin' } : { visibility: 'hidden' }}
      >
        {member ? <>
          {loading ? <p className="px-2.5 py-2 text-xs text-[var(--fs-muted)]" role="status">Loading your choices…</p> : <div className="grid gap-0.5 pt-1">
            <button className={actionClass} disabled={busy} onClick={() => void toggle('saved')} type="button">
              {state.saved ? <Check aria-hidden="true" className="size-4 text-orange" /> : <Bookmark aria-hidden="true" className="size-4" />}
              {state.saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
            </button>
            <button className={actionClass} disabled={busy} onClick={() => void toggle('watched')} type="button">
              <Eye aria-hidden="true" className="size-4" />
              {state.watched ? 'Remove from Watched' : 'Mark as watched'}
            </button>
            <button className={actionClass} disabled={busy} onClick={() => void toggle('liked')} type="button">
              {state.liked ? <Check aria-hidden="true" className="size-4 text-orange" /> : <Heart aria-hidden="true" className="size-4" />}
              {state.liked ? 'Unlike title' : 'Like title'}
            </button>
          </div>}
          <div className="mt-1.5 border-t border-[var(--fs-line)] pt-1.5">
            <span className="block px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fs-muted)]">Lists</span>
            <AddTitleToListTrigger compact expanded={listPickerOpen} onClick={() => { setOpen(false); setListPickerOpen(true) }} />
          </div>
          <div className="mt-1.5 border-t border-[var(--fs-line)] pt-1.5">
            <button aria-expanded={ratingOpen} className={actionClass} disabled={ratingBusy} onClick={() => setRatingOpen(value => !value)} type="button"><Star aria-hidden="true" className="size-4" />{state.rating === null ? 'Rate this title' : `Your rating · ${state.rating / 2} / 5`}</button>
            {ratingOpen ? <div className="px-2.5 py-2"><RatingInput disabled={ratingBusy} label={`Rate ${title} out of 5 stars`} name={`title-rating-${kind}-${id}`} onChange={value => void rate(value)} value={state.rating} /><p className="mt-2 text-[10px] leading-4 text-[var(--fs-muted)]">Half stars · {state.rating === null ? 'Choose a score' : `Saved ${state.rating / 2} of 5`}</p></div> : null}
          </div>
        </> : <div className="grid gap-0.5">
          {sessionStatus === 'unavailable' ? <p className="px-2.5 py-2 text-xs text-[var(--fs-muted)]">Member actions are temporarily unavailable. Try again shortly.</p> : <>
            <Link className={actionClass} href={signInHref('watchlist')} onClick={() => setOpen(false)}><Bookmark aria-hidden="true" className="size-4" />Add to Watchlist</Link>
            <Link className={actionClass} href={signInHref('watched')} onClick={() => setOpen(false)}><Eye aria-hidden="true" className="size-4" />Mark as watched</Link>
            <Link className={actionClass} href={signInHref('like')} onClick={() => setOpen(false)}><Heart aria-hidden="true" className="size-4" />Like title</Link>
            <Link className={actionClass} href={signInHref('list')} onClick={() => setOpen(false)}><ListPlus aria-hidden="true" className="size-4" />Add to a list</Link>
            <Link className={actionClass} href={signInHref('rate')} onClick={() => setOpen(false)}><Star aria-hidden="true" className="size-4" />Rate this title</Link>
          </>}
        </div>}
        {message ? <p className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-xs text-[var(--fs-muted)]" role="status">{message}{undoKey ? <button className="font-bold text-[var(--fs-accent)] underline underline-offset-2" onClick={() => void undo()} type="button">Undo</button> : null}</p> : null}
        <div className="mt-1.5 grid gap-0.5 border-t border-[var(--fs-line)] pt-1.5">
          <Link className={actionClass} href={member ? `${destination}#reviews` : signInHref('review')} onClick={() => setOpen(false)}><Star aria-hidden="true" className="size-4" />Write a review</Link>
          <Link className={actionClass} href={destination} onClick={() => setOpen(false)}><Eye aria-hidden="true" className="size-4" />Open title details</Link>
          <Link className={actionClass} href={playback} onClick={() => setOpen(false)}><Play aria-hidden="true" className="size-4" />Watch now</Link>
        </div>
      </div>
      </>, document.body,
    ) : null}
    {listPickerOpen ? <AddTitleToListDialog onClose={() => setListPickerOpen(false)} posterUrl={posterUrl} title={{ id, kind }} titleName={title} /> : null}
  </>
}
