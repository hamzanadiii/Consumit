'use client'

import type { CatalogKind } from '@consumit/contracts'
import { titleHref, watchHref } from '@consumit/contracts'
import { Bookmark, Check, Ellipsis, Eye, Heart, ListPlus, Play, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { getMemberTitleState, setMemberLiked, setMemberSaved, setMemberWatched } from '@/lib/identity-browser'
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

export function TitleCardQuickActions({ id, kind, posterUrl, title }: { id: number; kind: CatalogKind; posterUrl?: string | null | undefined; title: string }) {
  const session = useOptionalSession()
  const member = session?.member ?? null
  const sessionStatus = session?.status ?? 'anonymous'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [listPickerOpen, setListPickerOpen] = useState(false)
  const listPickerWasOpen = useRef(false)
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; theme: CSSProperties } | null>(null)
  const [state, setState] = useState({ saved: false, watched: false, liked: false })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
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
      setState({ saved: value.saved, watched: value.watched, liked: Boolean(value.like) })
    }).catch(() => {
      if (!cancelled) setMessage('Your saved actions could not load. Try closing and reopening this menu.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, kind, open, member])

  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const shell = triggerRef.current?.closest<HTMLElement>('[data-filscreen-home]') ?? null
      const width = Math.min(272, window.innerWidth - 24)
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
      const maxPanelHeight = Math.min(440, window.innerHeight - 24)
      const preferredTop = rect.bottom + 8
      const spaceBelow = window.innerHeight - preferredTop - 12
      const estimatedPanelHeight = member ? 324 : 248
      const panelHeight = Math.min(estimatedPanelHeight, maxPanelHeight)
      const opensAbove = spaceBelow < panelHeight
      const top = opensAbove ? Math.max(12, rect.top - panelHeight - 8) : Math.max(12, preferredTop)
      setPosition({ left, top, maxHeight: Math.min(maxPanelHeight, window.innerHeight - top - 12), theme: portalThemeStyle(shell) })
    }
    const close = () => setOpen(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
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
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, member])

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
      setMessage(next ? `${title} added to your ${key === 'saved' ? 'Watchlist' : key === 'watched' ? 'Watched' : 'Likes'}.` : `${title} removed from your ${key === 'saved' ? 'Watchlist' : key === 'watched' ? 'Watched' : 'Likes'}.`)
    } catch {
      setMessage(`Could not update ${title}. Try again.`)
    } finally { setBusy(false) }
  }

  const actionClass = TITLE_CARD_ACTION_ROW_CLASS

  function toggleMenu() {
    const nextOpen = !open
    if (nextOpen && member) {
      setLoading(true)
      setMessage(null)
    }
    setOpen(nextOpen)
  }

  return <>
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`More actions for ${title}`}
      className="group relative grid size-11 cursor-pointer place-items-center rounded-full text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
      onClick={toggleMenu}
      ref={triggerRef}
      type="button"
    >
      <span aria-hidden="true" className="absolute inset-[5px] rounded-full border border-[var(--fs-line)] bg-[var(--fs-shell)] shadow-[0_4px_12px_rgba(0,0,0,0.22)] backdrop-blur-sm transition-[background-color,border-color,box-shadow,transform] duration-150 group-hover:scale-105 group-hover:border-[var(--fs-accent)] group-hover:bg-[var(--fs-accent-soft)] group-hover:shadow-[0_0_0_3px_var(--fs-accent-soft)] motion-reduce:transition-none" />
      <Ellipsis aria-hidden="true" className="relative size-4 stroke-[2.5] transition-colors group-hover:text-[var(--fs-accent)]" />
    </button>
    {open && typeof document !== 'undefined' ? createPortal(
      <div
        aria-label={`${title} actions`}
        className="fixed z-[100] w-[min(17rem,calc(100vw-1.5rem))] overflow-y-auto rounded-card border border-[var(--fs-line)] bg-[var(--consumit-surface-raised)] p-1.5 text-[var(--fs-ink)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
        ref={panelRef}
        role="dialog"
        style={position ? { ...position.theme, left: position.left, top: position.top, maxHeight: position.maxHeight, scrollbarColor: 'var(--fs-muted) transparent', scrollbarWidth: 'thin' } : { visibility: 'hidden' }}
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
        </> : <div className="grid gap-0.5">
          {sessionStatus === 'unavailable' ? <p className="px-2.5 py-2 text-xs text-[var(--fs-muted)]">Member actions are temporarily unavailable.</p> : <Link className={actionClass} href={`/sign-in?next=${encodeURIComponent(destination)}`} onClick={() => setOpen(false)}><ListPlus aria-hidden="true" className="size-4" />Sign in to save titles</Link>}
        </div>}
        {message ? <p className="px-2.5 py-1.5 text-xs text-[var(--fs-muted)]" role="status">{message}</p> : null}
        <div className="mt-1.5 grid gap-0.5 border-t border-[var(--fs-line)] pt-1.5">
          <Link className={actionClass} href={`${destination}#reviews`} onClick={() => setOpen(false)}><Star aria-hidden="true" className="size-4" />Rate or review</Link>
          <Link className={actionClass} href={destination} onClick={() => setOpen(false)}><Eye aria-hidden="true" className="size-4" />Open title details</Link>
          <Link className={actionClass} href={playback} onClick={() => setOpen(false)}><Play aria-hidden="true" className="size-4" />Watch now</Link>
        </div>
      </div>, document.body,
    ) : null}
    {listPickerOpen ? <AddTitleToListDialog onClose={() => setListPickerOpen(false)} posterUrl={posterUrl} title={{ id, kind }} titleName={title} /> : null}
  </>
}
