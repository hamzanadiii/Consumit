'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, Search, ArrowUpRight } from 'lucide-react'
import { titleHref, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { browserSearchCatalog } from '@/lib/catalog-browser'

export const titleKey = (ref: CatalogRef) => `${ref.kind}:${ref.id}`
const tasteDateFormatter = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export function formatTasteDate(instant: string) {
  const date = new Date(instant)
  return Number.isNaN(date.valueOf()) ? instant : tasteDateFormatter.format(date)
}

export function TastePoster({ title, refValue, small = false, fallbackText }: { title?: CatalogTitleSummary | undefined; refValue: CatalogRef; small?: boolean; fallbackText?: string | undefined }) {
  const titleLabel = title?.title ?? `${refValue.kind} #${refValue.id}`
  const kindLabel = refValue.kind === 'series' ? 'Series' : refValue.kind === 'anime' ? 'Anime' : 'Movie'
  return <Link aria-label={small ? `${kindLabel} details: ${titleLabel}` : undefined} className={`taste-poster${small ? ' taste-poster-small' : ''}`} href={titleHref(refValue)}>
    <span className="taste-poster-art">{title?.posterUrl ? <Image alt="" fill sizes={small ? '90px' : '(max-width: 640px) 40vw, 220px'} src={title.posterUrl} /> : <span>{fallbackText ?? title?.title ?? 'Artwork unavailable'}</span>}</span>
    <strong>{title?.title ?? `${refValue.kind} #${refValue.id}`}</strong><span className="taste-muted">{[title?.year, refValue.kind].filter(Boolean).join(' · ')}</span>
  </Link>
}
export function TasteHeading({ title, href, action }: { title: string; href?: string | undefined; action?: string | undefined }) {
  return <div className="taste-section-heading"><h2>{title}</h2>{href ? <Link href={href}>{action ?? 'Explore'}<ArrowUpRight size={16} aria-hidden="true" /></Link> : null}</div>
}
export function Spoiler({ hidden, children, label = 'Contains spoilers' }: { hidden: boolean; children: ReactNode; label?: string }) {
  return hidden ? <details className="taste-spoiler"><summary>{label} · Reveal</summary><div>{children}</div></details> : <>{children}</>
}
export function TasteDialog({ title, children, onClose, className, dismissible = true, initialFocusRef }: { title: string; children: ReactNode; onClose: () => void; className?: string | undefined; dismissible?: boolean; initialFocusRef?: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId()
  useEffect(() => { const dialog = ref.current!; const previous = document.activeElement as HTMLElement | null; dialog.showModal(); initialFocusRef?.current?.focus(); return () => { dialog.close(); previous?.focus() } }, [initialFocusRef])
  return <dialog aria-labelledby={titleId} className={`taste taste-dialog${className ? ` ${className}` : ''}`} ref={ref} onCancel={event => { event.preventDefault(); if (dismissible) onClose() }} onClick={event => { if (dismissible && event.target === event.currentTarget) onClose() }}>
    <div className="taste-dialog-content"><header><h2 id={titleId}>{title}</h2><button className="taste-icon" aria-label="Close" disabled={!dismissible} onClick={onClose}><X size={20} /></button></header>{children}</div>
  </dialog>
}
export function TitlePicker({ onPick, selected = [], maxSelected }: { onPick: (title: CatalogTitleSummary) => void; selected?: readonly CatalogRef[]; maxSelected?: number }) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState<'all' | 'movie' | 'series' | 'anime'>('all')
  const [state, setState] = useState<{ query: string; items: CatalogTitleSummary[]; error?: string }>({ query: '', items: [] })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (query.trim().length < 2) return
    let current = true
    const timer = setTimeout(() => { void browserSearchCatalog(query, kind).then(result => { if (current) setState({ query: `${kind}:${query}`, items: result.items }) }).catch(() => { if (current) setState({ query: `${kind}:${query}`, items: [], error: 'Search could not load. Try again.' }) }) }, 200)
    return () => { current = false; clearTimeout(timer) }
  }, [query, kind, retry])
  const ready = state.query === `${kind}:${query}`
  const full = maxSelected !== undefined && selected.length >= maxSelected
  return <div className="taste-picker">{maxSelected !== undefined ? <p aria-label="Title selection" className="taste-muted" role="status">{selected.length} of {maxSelected} titles selected.{full ? ' Remove a selected title to add another.' : ''}</p> : null}<div className="taste-toolbar"><label><span className="sr-only">Search titles</span><Search size={17} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a movie, series or anime…" maxLength={100} /></label><select aria-label="Title type" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="all">All titles</option><option value="movie">Movies</option><option value="series">Series</option><option value="anime">Anime</option></select></div>
    {query.trim().length < 2 ? <p className="taste-muted">Search by name to begin.</p> : !ready ? <p role="status">Finding titles…</p> : state.error ? <p role="alert">{state.error} <button onClick={() => setRetry(x => x + 1)}>Retry</button></p> : !state.items.length ? <p>No titles found. Try another name.</p> : <div className="taste-picker-results">{state.items.map(title => <button key={titleKey(title)} disabled={full || selected.some(item => titleKey(item) === titleKey(title))} onClick={() => onPick(title)}>{title.posterUrl ? <Image src={title.posterUrl} width={40} height={60} alt="" /> : null}<span><strong>{title.title}</strong><small>{title.year} · {title.kind}</small></span><span>{selected.some(item => titleKey(item) === titleKey(title)) ? 'Added' : full ? 'Limit reached' : 'Add'}</span></button>)}</div>}
  </div>
}
