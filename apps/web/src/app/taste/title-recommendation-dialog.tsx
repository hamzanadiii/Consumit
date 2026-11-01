'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PublicMemberSummary } from '@consumit/contracts'
import { tasteRecommendationSchema } from '@consumit/contracts'
import { useSession } from '../session/session'
import { TasteDialog } from './primitives'
import { errorText, tasteWrite } from './api'
import { getProfileCollection } from '@/lib/identity-browser'

type Props = { id: number; kind: 'movie' | 'series' | 'anime'; title: string; onClose: () => void }

export function TitleRecommendationDialog({ id, kind, title, onClose }: Props) {
  const { member } = useSession()
  const [people, setPeople] = useState<PublicMemberSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (nextCursor?: string, signal?: AbortSignal) => {
    if (!member) return
    try {
      const page = await getProfileCollection(member.username, 'following', nextCursor, signal)
      if (page.collection !== 'following') throw new Error('Your followed members could not be loaded.')
      const visible = page.items.filter((person): person is PublicMemberSummary & { private: false } => 'username' in person && person.private === false && person.isFollowing)
      setPeople(current => nextCursor ? [...current, ...visible] : visible)
      setCursor(page.nextCursor)
    } catch (cause) {
      if (!signal?.aborted) setError(errorText(cause))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [member])

  function reload(nextCursor?: string) {
    setLoading(true)
    setError('')
    void load(nextCursor)
  }

  useEffect(() => {
    const controller = new AbortController()
    // The load changes state only after its awaited profile request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(undefined, controller.signal)
    return () => controller.abort()
  }, [load])

  async function send(recipientId: string) {
    if (busy) return
    setBusy(recipientId)
    setError('')
    try {
      await tasteWrite('recommendations', { recipientId, id, kind }, 'POST', tasteRecommendationSchema)
      setSentTo(recipientId)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(null)
    }
  }

  return <TasteDialog title="Recommend a title" onClose={onClose}>
    <div className="taste-form">
      <p className="taste-muted"><strong>{title}</strong></p>
      <p className="taste-muted">Choose someone you follow. They’ll get this title card in Notifications. There’s no message attached.</p>
      {loading && !people.length ? <p role="status">Loading people you follow…</p> : null}
      {!loading && !error && !people.length ? <p className="taste-empty">Follow someone to send them a title recommendation.</p> : null}
      {people.length ? <ul className="divide-y divide-[var(--fs-line)]">{people.map(person => <li className="flex items-center justify-between gap-4 py-3" key={person.id}>
        <span className="min-w-0"><strong className="block truncate">{person.displayName ?? person.username}</strong><small className="taste-muted">@{person.username}</small></span>
        {sentTo === person.id ? <span className="taste-muted" role="status">Sent</span> : <button className="taste-button taste-button-primary" disabled={Boolean(busy)} onClick={() => void send(person.id)}>{busy === person.id ? 'Sending…' : 'Recommend'}</button>}
      </li>)}</ul> : null}
      {cursor ? <button className="taste-button" disabled={loading} onClick={() => reload(cursor)}>{loading ? 'Loading…' : 'More people'}</button> : null}
      {error ? <p className="taste-status" role="alert">{error} <button className="taste-button" disabled={loading} onClick={() => reload()}>Retry</button></p> : null}
    </div>
  </TasteDialog>
}
