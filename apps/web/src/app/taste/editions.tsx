'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { z } from 'zod'
import { titleHref, tasteEditionReadSchema, type CatalogTitleSummary, type MemberProfileData, type TasteEdition } from '@consumit/contracts'
import { FilScreenShell } from '../shared'
import { TitlePicker, TastePoster, titleKey } from './primitives'
import { tasteWrite, errorText } from './api'
import { PublicationShare } from './share'
import { PublicationActions } from './social'

export function EditionReader({ edition, titles, owner }: { edition: z.infer<typeof tasteEditionReadSchema>; titles: CatalogTitleSummary[]; owner: boolean }) {
  const cover = titles.find(t => edition.data.cover && titleKey(t) === titleKey(edition.data.cover)), map = new Map(titles.map(t => [titleKey(t), t])), root = `/profile/${edition.author.username}`
  return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page"><Link href={root}>← {edition.author.name}’s profile</Link><header className="taste-cover"><div className="taste-cover-art">{cover?.backdropUrl || cover?.posterUrl ? <Image fill priority alt="" src={(cover.backdropUrl ?? cover.posterUrl)!} sizes="(max-width:640px) 100vw,65vw" /> : <div className="taste-cover-placeholder">{edition.data.month}<br />Remembered.</div>}</div><div className="taste-cover-copy"><time>{edition.data.month}</time><h1>{edition.data.title}</h1><Link href={root}>An edition by {edition.author.name}</Link><div className="taste-actions"><PublicationShare kind="edition" id={edition.id} />{!owner ? <PublicationActions target={{ kind: 'edition', id: edition.id }} memberId={edition.author.id} /> : null}{owner ? <Link className="taste-button" href={`${root}/editions/${edition.data.month}?edit=1`}>Edit edition</Link> : null}</div></div></header><div className="taste-reading"><p className="taste-prose taste-prose-large">{edition.data.introduction}</p><section><h2>The titles that stayed</h2>{edition.data.picks.map((pick, index) => <article className="taste-list-row" key={titleKey(pick)}><span>{index + 1}</span><TastePoster small refValue={pick} title={map.get(titleKey(pick))} /><div><h3><Link href={titleHref(pick)}>{map.get(titleKey(pick))?.title ?? `${pick.kind} #${pick.id}`}</Link></h3><p className="taste-prose">{pick.reason}</p></div></article>)}</section><section className="taste-actions">{edition.data.reviewId ? <Link className="taste-button" href={`/reviews/${edition.data.reviewId}`}>Read the featured review</Link> : null}{edition.listHref ? <Link className="taste-button" href={edition.listHref}>Explore the featured collection</Link> : null}</section></div></main></FilScreenShell>
}

export function EditionEditor({ data, revision, publishedAt, profile, titles }: { data: TasteEdition; revision: number; publishedAt: string | null; profile: MemberProfileData; titles: CatalogTitleSummary[] }) {
  const router = useRouter(), retryRef = useRef<HTMLButtonElement>(null)
  const [edition, setEdition] = useState(data), [version, setVersion] = useState(revision), [art, setArt] = useState(titles), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failedOperation, setFailedOperation] = useState<'draft' | 'publish' | 'unpublish' | null>(null), [coverPicker, setCoverPicker] = useState(false)
  const map = new Map(art.map(t => [titleKey(t), t])), root = `/profile/${profile.canonicalUsername}`
  async function save(publish: boolean) {
    setBusy(true); setMessage(''); setFailedOperation(null)
    try {
      const result = await tasteWrite('editions', { ...edition, revision: version, publish }, 'PUT', z.object({ revision: z.number() }))
      setVersion(result.revision); setMessage(publish ? 'Edition published.' : 'Private draft saved.')
      if (publish) { router.push(`${root}/editions/${edition.month}`); router.refresh() }
    } catch (cause) { setMessage(errorText(cause)); setFailedOperation(publish ? 'publish' : 'draft') }
    finally { setBusy(false) }
  }
  async function unpublish() {
    setBusy(true); setMessage(''); setFailedOperation(null)
    try { await tasteWrite(`editions/${edition.month}`, undefined, 'DELETE'); router.push(root); router.refresh() }
    catch (cause) { setMessage(errorText(cause)); setFailedOperation('unpublish') }
    finally { setBusy(false) }
  }
  function retry() {
    if (failedOperation === 'unpublish') void unpublish()
    else if (failedOperation) void save(failedOperation === 'publish')
  }
  const retryLabel = failedOperation === 'publish' ? 'Retry publishing edition' : failedOperation === 'unpublish' ? 'Retry unpublishing edition' : 'Retry saving private draft'
  useEffect(() => { if (failedOperation) retryRef.current?.focus() }, [failedOperation])
  const suggested = profile.diary.filter(entry => entry.watchedOn.startsWith(edition.month)).filter((r, i, all) => all.findIndex(x => titleKey(x) === titleKey(r)) === i).slice(0, 3)
  return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-edition-editor"><Link href={root}>← Your profile</Link><h1>A month, in your words.</h1><p className="taste-empty">{publishedAt ? 'Your current edition stays public while you edit. New changes stay private until you publish.' : 'Choose what deserves remembering. This stays private until you publish.'}</p><fieldset className="taste-form" disabled={busy}><div className="taste-editor-grid"><div className="taste-form"><label>Edition month<input type="month" value={edition.month} readOnly /></label><label>Title<input value={edition.title} maxLength={120} onChange={e => setEdition({ ...edition, title: e.target.value })} /></label><label>Your introduction<textarea rows={6} value={edition.introduction} maxLength={2000} onChange={e => setEdition({ ...edition, introduction: e.target.value })} placeholder="What did this month feel like? What surprised you?" /></label></div><section className="taste-form"><h2>The cover</h2>{edition.cover ? <TastePoster refValue={edition.cover} title={map.get(titleKey(edition.cover))} /> : <p className="taste-empty">Choose the title that sets the tone.</p>}<button className="taste-button" onClick={() => setCoverPicker(!coverPicker)}>{coverPicker ? 'Close search' : 'Choose cover title'}</button>{coverPicker ? <TitlePicker onPick={title => { setEdition({ ...edition, cover: { kind: title.kind, id: title.id } }); setArt(old => [...old.filter(t => titleKey(t) !== titleKey(title)), title]); setCoverPicker(false) }} /> : null}</section></div>
    <section><div className="taste-section-heading"><h2>Three picks, with a reason</h2>{!edition.picks.length && suggested.length ? <button className="taste-button" onClick={() => setEdition({ ...edition, picks: suggested.map(({ kind, id }) => ({ kind, id, reason: '' })) })}>Start from my diary</button> : null}</div>{edition.picks.map((pick, index) => <div className="taste-list-row" key={titleKey(pick)}><span>{index + 1}</span><TastePoster small refValue={pick} title={map.get(titleKey(pick))} /><label>{map.get(titleKey(pick))?.title ?? `${pick.kind} #${pick.id}`}<textarea maxLength={500} value={pick.reason} onChange={e => setEdition({ ...edition, picks: edition.picks.map((p, i) => i === index ? { ...p, reason: e.target.value } : p) })} placeholder="Why this one?" /><button className="taste-button" onClick={() => setEdition({ ...edition, picks: edition.picks.filter((_, i) => i !== index) })}>Remove pick</button></label></div>)}{edition.picks.length < 3 ? <TitlePicker selected={edition.picks} onPick={title => { setEdition({ ...edition, picks: [...edition.picks, { id: title.id, kind: title.kind, reason: '' }] }); setArt(old => [...old.filter(t => titleKey(t) !== titleKey(title)), title]) }} /> : null}</section>
    <div className="taste-editor-grid"><label>Featured review<select value={edition.reviewId ?? ''} onChange={e => setEdition({ ...edition, reviewId: e.target.value || null })}><option value="">No featured review</option>{profile.reviews.map(r => <option key={r.reviewId} value={r.reviewId}>{map.get(titleKey(r))?.title ?? r.body.slice(0, 60)}</option>)}</select></label><label>Featured public list<select value={edition.listId ?? ''} onChange={e => setEdition({ ...edition, listId: e.target.value || null })}><option value="">No featured list</option>{profile.lists.filter(l => l.visibility === 'public').map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label></div></fieldset>
    {message ? <div className="taste-status taste-editor-message" role={failedOperation ? 'alert' : 'status'}><span>{message}</span>{failedOperation ? <button className="taste-button" disabled={busy} onClick={retry} ref={retryRef}>{retryLabel}</button> : null}</div> : null}<div className="taste-editor-bar"><div className="taste-actions"><Link className="taste-button" href={root}>Back to profile</Link><button className="taste-button" aria-label="Save private draft" disabled={busy || !edition.title.trim()} onClick={() => void save(false)}><span className="taste-editor-save-long">Save private draft</span><span className="taste-editor-save-short">Save draft</span></button>{publishedAt ? <button className="taste-button" disabled={busy} onClick={() => void unpublish()}>Unpublish</button> : null}</div><button className="taste-button taste-button-primary" disabled={busy || !edition.title.trim() || edition.picks.length !== 3 || edition.picks.some(p => !p.reason.trim())} onClick={() => void save(true)}>{busy ? 'Saving…' : 'Publish edition'}</button></div>
  </main></FilScreenShell>
}

