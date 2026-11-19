'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usernameSchema, type MemberListDetail } from '@consumit/contracts'
import { addListCollaborator, removeListCollaborator, deleteMemberList, IdentityApiError } from '@/lib/identity-browser'
import { TasteDialog } from './primitives'
import { errorText } from './api'

export function CollectionManagement({ data }: { data: MemberListDetail }) {
  const router = useRouter()
  const headingId = useId()
  const usernameInput = useRef<HTMLInputElement>(null)
  const keepCollectionButton = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const restoreUsernameFocus = useRef(false)
  const [username, setUsername] = useState('')
  const [operation, setOperation] = useState<string | null>(null)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (operation === null && restoreUsernameFocus.current) {
      restoreUsernameFocus.current = false
      usernameInput.current?.focus()
    }
  }, [operation])
  const busy = operation !== null
  const parsedUsername = usernameSchema.safeParse(username.trim().replace(/^@/, ''))
  async function change(name: string, action: () => Promise<unknown>, onSuccess: () => void) {
    if (pending.current) return
    pending.current = true
    setOperation(name); setError(''); setMessage('')
    let completed = false
    try { await action(); onSuccess(); completed = true; router.refresh() }
    catch (cause) { setError(errorText(cause)) }
    finally { if (name !== 'delete' || !completed) { pending.current = false; setOperation(null) } }
  }
  async function deleteCollection() {
    try { await deleteMemberList(data.list.id) }
    catch (cause) {
      // A confirmed deletion may have succeeded before its response was lost.
      if (!(cause instanceof IdentityApiError && cause.code === 'NOT_FOUND')) throw cause
    }
  }
  function addEditor() {
    if (!parsedUsername.success) return
    const normalized = parsedUsername.data
    void change('add', () => addListCollaborator(data.list.id, normalized), () => {
      setUsername(''); setMessage(`@${normalized} can now edit this collection.`)
    })
  }
  if (!data.viewerIsOwner) return null
  return <section aria-labelledby={headingId} className="taste-form taste-chapter taste-collection-management">
    <h2 id={headingId}>Collection editors</h2>
    <p className="taste-muted">Editors can open this collection, including when it is private, and change its details, titles and chapters. Only you can change visibility, manage editors or delete the collection.</p>
    <form className="taste-form" onSubmit={event => { event.preventDefault(); addEditor() }}>
      <fieldset className="taste-editor-invite" disabled={busy}>
        <label>Member username<input autoCapitalize="none" autoComplete="off" aria-describedby={`${headingId}-username-help`} maxLength={31} onChange={event => setUsername(event.target.value)} placeholder="@username" ref={usernameInput} spellCheck={false} value={username} /></label>
        <button className="taste-button" disabled={busy || !parsedUsername.success} type="submit">{operation === 'add' ? 'Adding editor…' : 'Add editor'}</button>
      </fieldset>
      <p className="taste-muted" id={`${headingId}-username-help`}>Use an existing member’s username: 3–30 letters, numbers or underscores. Adding them grants access immediately.</p>
    </form>
    {data.collaborators.length ? data.collaborators.map(person => <div className="taste-order-row" key={person.memberId}>
      <span>{person.displayName ?? person.username} · @{person.username}</span>
      <button aria-label={`${operation === `remove:${person.username}` ? 'Removing' : 'Remove'} @${person.username} as editor`} className="taste-button" disabled={busy} onClick={() => void change(`remove:${person.username}`, () => removeListCollaborator(data.list.id, person.username), () => {
        setMessage(`@${person.username} no longer has edit access.`); restoreUsernameFocus.current = true
      })} type="button">{operation === `remove:${person.username}` ? 'Removing…' : 'Remove editor'}</button>
    </div>) : <p className="taste-muted">You are the only editor.</p>}
    {message ? <p role="status">{message}</p> : null}
    {error && !deleting ? <p role="alert">{error}</p> : null}
    <button className="taste-button" disabled={busy} onClick={() => { setError(''); setDeleting(true) }} type="button">Delete collection</button>
    {deleting ? <TasteDialog className="taste-delete-dialog" initialFocusRef={keepCollectionButton} dismissible={!busy} title="Delete this collection?" onClose={() => { if (!pending.current) setDeleting(false) }}>
      <div className="taste-form"><p><strong>{data.list.name}</strong>, its title order and its notes will be removed. Your title ratings and watch history stay in your library.</p>
      <div className="taste-actions">
        <button ref={keepCollectionButton} className="taste-button" disabled={busy} onClick={() => setDeleting(false)} type="button">Keep collection</button>
        <button className="taste-button" disabled={busy} onClick={() => void change('delete', deleteCollection, () => router.push(`/profile/${data.owner.username}/lists`))} type="button">{operation === 'delete' ? 'Deleting…' : 'Delete collection'}</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}</div>
    </TasteDialog> : null}
  </section>
}
