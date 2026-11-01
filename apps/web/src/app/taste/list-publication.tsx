'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowDown, ArrowUp, X, Plus } from 'lucide-react'
import { z } from 'zod'
import { kindLabel, titleHref, tasteDraftReadSchema, tasteListReadSchema, tasteListWriteSchema, tasteListLayoutSchema, type CatalogTitleSummary, type CatalogRef, type MemberListDetail, type PublicListDetail, type TasteListLayout, type TasteListWrite } from '@consumit/contracts'
import { createMemberList, getMemberListDetail, IdentityApiError } from '@/lib/identity-browser'
import { FilScreenShell } from '../shared'
import { ListShareActions } from '../lists/list-share-actions'
import { TastePoster, TitlePicker, titleKey } from './primitives'
import { tasteRead, tasteWrite, errorText } from './api'
import { Discussion, PublicationActions } from './social'
import { PublicationShare } from './share'
import { CollectionManagement } from './collection-management'
import { CollectionVersionChoice, type CollectionVersionChoiceState } from './collection-version-choice'

// Private drafts preserve unfinished names; collection writes still use the strict contract.
const collectionDraftInputSchema = tasteListWriteSchema.safeExtend({
  name: z.string().max(120),
  layout: tasteListLayoutSchema.safeExtend({
    chapters: z.array(tasteListLayoutSchema.shape.chapters.unwrap().element.safeExtend({
      name: z.string().max(100),
    })).max(30).default([]),
  }),
})

type ListData = MemberListDetail | PublicListDetail
function listVisibilityDescription(visibility: MemberListDetail['list']['visibility']) {
  if (visibility === 'public') return 'Public lists appear on their curator’s profile and in discovery while their Lists section is visible.'
  if (visibility === 'unlisted') return 'Anyone with this link can open the list. It stays out of profiles and discovery, and search engines are asked not to index it.'
  return 'Private lists are visible only to their owner and invited editors.'
}

function collectionInput(data: ListData, layout: TasteListLayout, revision: number, preset?: string): TasteListWrite {
  return { revision, name: data.list.name, description: data.list.description, visibility: data.list.visibility, items: data.items.map(({ kind, id, note }) => ({ kind, id, note })), layout: preset && ['collection', 'ranking', 'watch-order'].includes(preset) ? { ...layout, preset: preset as TasteListLayout['preset'] } : layout, publishUpdate: false }
}
export function ListPublication({ data, titles, layout, signedIn, watched = [] }: { data: ListData; titles: CatalogTitleSummary[]; layout: TasteListLayout; signedIn: boolean; watched?: CatalogRef[] }) {
  const [view, setView] = useState<'reading' | 'posters'>('reading')
  const viewId = useId()
  function changeViewWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    let next: typeof view
    if (event.key === 'Home') next = 'reading'
    else if (event.key === 'End') next = 'posters'
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = view === 'reading' ? 'posters' : 'reading'
    else return
    event.preventDefault()
    setView(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-collection-view="${next}"]`)?.focus()
  }
  const map = new Map(titles.map(t => [titleKey(t), t])), canEdit = 'viewerCanEdit' in data && data.viewerCanEdit
  const cover = layout.cover ? map.get(titleKey(layout.cover)) : titles.find(t => t.backdropUrl || t.posterUrl)
  const coverSrc = cover?.backdropUrl ?? cover?.posterUrl
  const watchedKeys = new Set(watched.map(titleKey))
  const positions = new Map(data.items.map((item, index) => [titleKey(item), index + 1]))
  const groups = [{ id: '', name: layout.chapters.length ? 'Opening titles' : 'The collection', introduction: '' }, ...layout.chapters]
  return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page"><Link href={`/profile/${data.owner.username}/lists`}>← {data.owner.displayName ?? data.owner.username}’s lists</Link>
    <header className={`taste-cover${coverSrc ? '' : ' taste-cover-text-only'}`}>
      {coverSrc ? <div className="taste-cover-art"><Image src={coverSrc} alt="" fill priority sizes="(max-width:640px) 100vw,65vw" /></div> : null}
      <div className="taste-cover-copy"><h1>{data.list.name}</h1><p className="taste-meta">{data.items.length} titles · {layout.preset === 'watch-order' ? 'Watch order' : layout.preset === 'ranking' ? 'Ranking' : 'Collection'} · {data.list.visibility}</p><Link href={`/profile/${data.owner.username}`}>Curated by {data.owner.displayName ?? data.owner.username}</Link>{data.list.description ? <p className="taste-prose">{data.list.description}</p> : null}<p className="text-[var(--fs-secondary)]" data-list-visibility-copy>{listVisibilityDescription(data.list.visibility)}</p>{layout.genres.length ? <ul aria-label="Collection genres" className="taste-collection-genres">{layout.genres.map(genre => <li key={genre}>{genre}</li>)}</ul> : null}{canEdit ? <Link className="taste-button taste-button-primary" href={`/lists/${data.list.slug}/edit`}>Edit collection</Link> : null}</div>
    </header>
    <div className="taste-actions">{data.list.visibility !== 'private' ? <><PublicationShare kind="list" id={data.list.id} /><ListShareActions hideShare isOwner={data.viewerIsOwner} listId={data.list.id} name={data.list.name} saved={data.viewerHasSaved} signedIn={signedIn} slug={data.list.slug} visibility={data.list.visibility} /></> : null}{signedIn && !data.viewerIsOwner ? <PublicationActions target={{ kind: 'list', id: data.list.id }} subscribe /> : null}</div>
    <div className="taste-tabs" role="tablist" aria-label="Collection view" onKeyDown={changeViewWithKeyboard}>
      {([{ value: 'reading', label: 'Read the collection' }, { value: 'posters', label: 'Browse posters' }] as const).map(item => <button aria-controls={`${viewId}-panel`} aria-selected={view === item.value} data-collection-view={item.value} id={`${viewId}-${item.value}`} key={item.value} onClick={() => setView(item.value)} role="tab" tabIndex={view === item.value ? 0 : -1} type="button">{item.label}</button>)}
    </div>
    <div aria-labelledby={`${viewId}-${view}`} className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" id={`${viewId}-panel`} role="tabpanel" tabIndex={0}>
    {!data.items.length ? <p className="taste-empty">{canEdit ? 'Your idea starts here. Add the first title to your collection.' : 'The curator has not added titles yet.'}</p> : null}
    {groups.map(group => {
      const items = data.items.filter(item => (layout.assignments[titleKey(item)] ?? '') === group.id)
      return items.length ? <section className="taste-chapter" key={group.id}>
        <h2>{group.name}</h2>
        {group.introduction ? <p className="taste-prose">{group.introduction}</p> : null}
        {view === 'posters' ? <div className="taste-poster-grid">{items.map(item => <div key={titleKey(item)}><TastePoster refValue={item} title={map.get(titleKey(item))} />{watchedKeys.has(titleKey(item)) ? <small className="taste-muted">Watched by you</small> : null}</div>)}</div> : items.map(item => {
          const key = titleKey(item), title = map.get(key)
          return <article className="taste-collection-row" key={key}>
            <h3><Link href={titleHref(item)}>{title?.title ?? `${kindLabel(item.kind)} #${item.id}`}</Link></h3>
            <span className="taste-collection-position taste-muted">{layout.preset !== 'collection' ? positions.get(key) : ''}</span>
            <TastePoster small refValue={item} title={title} />
            <p className="taste-collection-meta taste-muted">{[title?.year, kindLabel(item.kind)].filter(Boolean).join(' · ')}{watchedKeys.has(key) ? <small className="block">Watched by you</small> : null}</p>
            {item.note ? <p className="taste-collection-note taste-prose">{item.note}</p> : null}
          </article>
        })}
      </section> : null
    })}
    </div>
    <Discussion target={{ kind: 'list', id: data.list.id }} />
  </main></FilScreenShell>
}

export function CollectionEditor({ data, titles, initialLayout, revision, preset }: { data: MemberListDetail; titles: CatalogTitleSummary[]; initialLayout: TasteListLayout; revision: number; preset?: string | undefined }) {
  const router = useRouter()
  const visibilityHelpId = useId()
  const genreHelpId = useId()
  const chapterRemovalHelpId = useId()
  const chapterCapacityId = useId()
  const collectionName = useRef<HTMLInputElement>(null)
  const newChapterName = useRef<HTMLInputElement>(null)
  const titlesHeading = useRef<HTMLHeadingElement>(null)
  const [removedTitle, setRemovedTitle] = useState<{ item: TasteListWrite['items'][number]; index: number; chapterId: string | undefined; restoreCover: boolean } | null>(null)
  const [changesMessage, setChangesMessage] = useState('')
  const [removedChapter, setRemovedChapter] = useState<{ chapter: TasteListLayout['chapters'][number]; index: number; assignedKeys: string[] } | null>(null)
  const [chapterMessage, setChapterMessage] = useState('')
  const restoreEditorFocus = useRef(false)
  const [savedInput] = useState(() => collectionInput(data, initialLayout, revision, preset))
  const [input, setInput] = useState(savedInput)
  const reorderNodes = useRef(new Map<string, HTMLElement>())
  const reorderFocus = useRef<string | null>(null)
  const [orderMessage, setOrderMessage] = useState('')
  useEffect(() => {
    const key = reorderFocus.current
    if (key) {
      reorderFocus.current = null
      const target = key === 'titles' ? titlesHeading.current : key === 'chapters' ? newChapterName.current : reorderNodes.current.get(key)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [input.items, input.layout.chapters])
  const [art, setArt] = useState(titles), [saving, setSaving] = useState<'draft' | 'collection' | 'latest' | null>(null), [error, setError] = useState(''), [chapterName, setChapterName] = useState('')
  const [conflict, setConflict] = useState(false)
  const [accessLost, setAccessLost] = useState(false)
  const errorRegion = useRef<HTMLDivElement>(null)
  const busy = saving !== null
  const [draftRevision, setDraftRevision] = useState(0), [draftState, setDraftState] = useState<'loading' | 'ready' | 'failed' | 'skipped' | 'choice'>('loading'), [draftMessage, setDraftMessage] = useState('Loading private draft…')
  const [versionChoice, setVersionChoice] = useState<CollectionVersionChoiceState | null>(null)
  useEffect(() => {
    if (!versionChoice && restoreEditorFocus.current) {
      restoreEditorFocus.current = false
      collectionName.current?.focus()
    }
  }, [versionChoice])
  const [draftAttempt, setDraftAttempt] = useState(0), [draftError, setDraftError] = useState('')
  const draftReady = draftState === 'ready' || draftState === 'skipped'
  const visibilityGuidance = !data.viewerIsOwner
    ? 'Only the collection owner can change visibility, manage editors or delete this collection.'
    : input.visibility === 'public'
      ? 'Public lists appear on your profile and in discovery while your Lists section is visible.'
      : input.visibility === 'unlisted'
        ? 'Anyone with this link can open this list. It stays out of profiles and discovery; search engines are asked not to index it.'
        : 'Only you and invited editors can open this list.'
  useEffect(() => {
    if (!error) return
    errorRegion.current?.focus({ preventScroll: true })
    errorRegion.current?.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [error])
  useEffect(() => {
    const controller = new AbortController()
    void tasteRead(`drafts/collection-${data.list.id}`, tasteDraftReadSchema, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setDraftRevision(result.revision)
      const recovered = collectionDraftInputSchema.safeParse(result.data)
      if (recovered.success && recovered.data.revision !== savedInput.revision) {
        setVersionChoice({ latest: savedInput, working: recovered.data, source: 'draft', draftLoaded: true })
        setDraftMessage('Your private draft and the saved collection need a version choice.')
        setDraftState('choice')
        return
      }
      if (recovered.success) setInput(recovered.data)
      setDraftMessage(recovered.success ? 'Private draft restored. Save collection when it is ready.' : 'Use Save private draft to return to an unfinished collection.')
      setDraftState('ready')
    }).catch(cause => { if (!controller.signal.aborted) { setDraftState('failed'); setDraftError(errorText(cause)); setDraftMessage('Your saved collection is safe. Retry your private draft, or edit the saved collection.') } })
    return () => controller.abort()
  }, [data.list.id, draftAttempt, savedInput])
  function chooseVersion(useWorking: boolean) {
    if (!versionChoice) return
    setRemovedTitle(null); setChangesMessage('')
    setRemovedChapter(null); setChapterMessage('')
    setInput(useWorking ? { ...versionChoice.working, revision: versionChoice.latest.revision, publishUpdate: false } : versionChoice.latest)
    setDraftState(useWorking && versionChoice.draftLoaded ? 'ready' : 'skipped')
    setDraftMessage(useWorking ? 'Your selected edits are in the editor. Save collection will replace the latest saved fields.' : 'Editing the latest saved collection. Your private draft has not been changed.')
    restoreEditorFocus.current = true
    setVersionChoice(null); setError(''); setConflict(false)
  }
  async function reviewLatest() {
    setSaving('latest')
    try {
      const [latestData, latestLayout] = await Promise.all([getMemberListDetail(data.list.slug), tasteRead(`lists/${data.list.id}`, tasteListReadSchema)])
      if (!('viewerCanEdit' in latestData) || !latestData.viewerCanEdit) {
        setAccessLost(true); setConflict(false)
        throw new Error('You no longer have permission to edit this collection. You can still download your work.')
      }
      setAccessLost(false)
      setVersionChoice({ latest: collectionInput(latestData, latestLayout.layout, latestLayout.revision), working: input, source: accessLost ? 'access' : 'conflict', draftLoaded: draftState === 'ready' })
      setDraftState('choice'); setDraftMessage('Review the latest changes before choosing a version to edit.'); setError(''); setConflict(false)
    } catch (cause) {
      setError(errorText(cause))
      if (cause instanceof IdentityApiError && (cause.code === 'NOT_FOUND' || cause.code === 'FORBIDDEN')) { setAccessLost(true); setConflict(false) }
    } finally { setSaving(null) }
  }
  function downloadDraft() {
    const blob = new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob), anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'consumit-collection-draft.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  async function saveDraft() {
    if (draftState !== 'ready') return
    setSaving('draft'); setError('')
    try { const result = await tasteWrite(`drafts/collection-${data.list.id}`, { revision: draftRevision, data: input }, 'PUT', tasteDraftReadSchema); setDraftRevision(result.revision); setDraftMessage('Private draft saved. The published collection has not changed.') }
    catch (cause) { setError(errorText(cause)) } finally { setSaving(null) }
  }
  const map = new Map(art.map(t => [titleKey(t), t]))
  function patchLayout(changes: Partial<TasteListLayout>) {
    if ('cover' in changes) setRemovedTitle(previous => previous ? { ...previous, restoreCover: false } : null)
    setInput({ ...input, layout: { ...input.layout, ...changes } })
  }
  function toggleGenre(genre: TasteListLayout['genres'][number], checked: boolean) {
    const genres = input.layout.genres
    if (checked && (genres.length >= 3 || genres.includes(genre))) return
    patchLayout({ genres: checked ? [...genres, genre] : genres.filter(value => value !== genre) })
  }
  function addTitle(title: CatalogTitleSummary) {
    const key = titleKey(title)
    if (input.items.length >= 500 || input.items.some(item => titleKey(item) === key)) return
    if (removedTitle && titleKey(removedTitle.item) === key) setRemovedTitle(null)
    setRemovedChapter(previous => previous ? { ...previous, assignedKeys: previous.assignedKeys.filter(value => value !== key) } : null)
    reorderFocus.current = `title:${key}`
    setInput({ ...input, items: [...input.items, { kind: title.kind, id: title.id, note: null }] })
    setArt(old => [...old.filter(item => titleKey(item) !== key), title])
    setChangesMessage(`Added ${title.title} to the collection.`)
  }
  function move(index: number, direction: number) {
    const items = [...input.items], next = index + direction
    if (next < 0 || next >= items.length) return
    const moved = items[index]!
    ;[items[index], items[next]] = [items[next]!, items[index]!]
    reorderFocus.current = `title:${titleKey(moved)}`
    setOrderMessage(`${map.get(titleKey(moved))?.title ?? `${kindLabel(moved.kind)} #${moved.id}`} moved to position ${next + 1} of ${items.length}.`)
    setInput({ ...input, items })
  }
  function addChapter() {
    if (busy || !draftReady || !chapterName.trim() || input.layout.chapters.length >= 30) return
    const chapter = { id: crypto.randomUUID(), name: chapterName.trim(), introduction: '' }
    reorderFocus.current = `chapter:${chapter.id}`
    patchLayout({ chapters: [...input.layout.chapters, chapter] })
    setChapterName('')
    setChapterMessage(`Added ${chapter.name}.`)
  }
  function moveChapter(index: number, direction: number) {
    const chapters = [...input.layout.chapters], next = index + direction
    if (next < 0 || next >= chapters.length) return
    const moved = chapters[index]!
    ;[chapters[index], chapters[next]] = [chapters[next]!, chapters[index]!]
    reorderFocus.current = `chapter:${moved.id}`
    setOrderMessage(`${moved.name || 'Unnamed chapter'} moved to chapter position ${next + 1} of ${chapters.length}.`)
    patchLayout({ chapters })
  }
  function removeChapter(index: number) {
    const chapter = input.layout.chapters[index]!
    const assignedKeys = Object.entries(input.layout.assignments).filter(([, id]) => id === chapter.id).map(([key]) => key)
    const chapters = input.layout.chapters.filter((_, i) => i !== index)
    const neighbor = chapters[index] ?? chapters[index - 1]
    setRemovedChapter({ chapter, index, assignedKeys })
    reorderFocus.current = neighbor ? `chapter:${neighbor.id}` : 'chapters'
    setChapterMessage(`Removed ${chapter.name || 'Unnamed chapter'}. ${assignedKeys.length} ${assignedKeys.length === 1 ? 'title' : 'titles'} moved to Opening titles.`)
    patchLayout({ chapters, assignments: Object.fromEntries(Object.entries(input.layout.assignments).filter(([, id]) => id !== chapter.id)) })
  }
  function undoChapterRemoval() {
    if (!removedChapter || input.layout.chapters.length >= 30) return
    const { chapter, index, assignedKeys } = removedChapter
    const chapters = [...input.layout.chapters]
    chapters.splice(Math.min(index, chapters.length), 0, chapter)
    const assignments = { ...input.layout.assignments }
    const present = new Set(input.items.map(titleKey))
    for (const key of assignedKeys) if (present.has(key) && !assignments[key]) assignments[key] = chapter.id
    reorderFocus.current = `chapter:${chapter.id}`
    patchLayout({ chapters, assignments })
    setChapterMessage(`Restored ${chapter.name || 'Unnamed chapter'}.`)
    setRemovedChapter(null)
  }
  function assignChapter(item: CatalogRef, chapterId: string) {
    const key = titleKey(item), assignments = { ...input.layout.assignments }
    if (chapterId) assignments[key] = chapterId
    else delete assignments[key]
    setRemovedChapter(previous => previous ? { ...previous, assignedKeys: previous.assignedKeys.filter(value => value !== key) } : null)
    patchLayout({ assignments })
  }
  function remove(index: number) {
    const item = input.items[index]!, key = titleKey(item), assignments = { ...input.layout.assignments }
    const restoreCover = Boolean(input.layout.cover && titleKey(input.layout.cover) === key)
    setRemovedTitle({ item, index, chapterId: assignments[key], restoreCover })
    delete assignments[key]
    const items = input.items.filter((_, i) => i !== index)
    const neighbor = items[index] ?? items[index - 1]
    reorderFocus.current = neighbor ? `title:${titleKey(neighbor)}` : 'titles'
    setChangesMessage(`Removed ${map.get(key)?.title ?? `${kindLabel(item.kind)} #${item.id}`} from the collection.`)
    setInput({ ...input, items, layout: { ...input.layout, assignments, cover: restoreCover ? null : input.layout.cover } })
  }
  function undoTitleRemoval() {
    if (!removedTitle || input.items.length >= 500) return
    const { item, index, chapterId, restoreCover } = removedTitle, key = titleKey(item)
    const items = input.items.filter(value => titleKey(value) !== key)
    items.splice(Math.min(index, items.length), 0, item)
    const assignments = { ...input.layout.assignments }
    if (chapterId && input.layout.chapters.some(chapter => chapter.id === chapterId)) assignments[key] = chapterId
    reorderFocus.current = `title:${key}`
    setInput({ ...input, items, layout: { ...input.layout, assignments, cover: restoreCover && !input.layout.cover ? { kind: item.kind, id: item.id } : input.layout.cover } })
    setChangesMessage(`Restored ${map.get(key)?.title ?? `${kindLabel(item.kind)} #${item.id}`} to the collection.`)
    setRemovedTitle(null)
  }
  async function save() {
    if (accessLost) return
    setSaving('collection'); setError(''); setConflict(false)
    try {
      await tasteWrite(`lists/${data.list.id}`, input)
      if (draftState === 'ready') await tasteWrite(`drafts/collection-${data.list.id}`, { revision: draftRevision, data: {} }).catch(() => undefined)
      router.push(`/lists/${data.list.slug}`); router.refresh()
    } catch (cause) {
      setError(errorText(cause)); setConflict(cause instanceof IdentityApiError && cause.code === 'CONFLICT')
      if (cause instanceof IdentityApiError && (cause.code === 'NOT_FOUND' || cause.code === 'FORBIDDEN')) setAccessLost(true)
    } finally { setSaving(null) }
  }
  return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-collection-editor"><Link href={`/lists/${data.list.slug}`}>← Back to collection</Link><h1>Give your idea a shape.</h1><p className="taste-empty">Arrange the titles. Connect the chapters. Tell us why they belong.</p>
    <p aria-label="Collection order" className="sr-only" role="status">{orderMessage}</p><p aria-label="Private draft" role="status" className="taste-muted taste-editor-draft-status">{draftMessage}</p>
    {versionChoice ? <CollectionVersionChoice {...versionChoice} titles={art} onLatest={() => chooseVersion(false)} onWorking={() => chooseVersion(true)} /> : null}
    {draftError ? <div className="taste-status" role="alert">
      <p>{draftError}</p>
      <div className="taste-actions">
        <button className="taste-button" onClick={() => { setDraftState('loading'); setDraftError(''); setDraftMessage('Loading private draft…'); setDraftAttempt(value => value + 1) }} type="button">Retry loading draft</button>
        <button className="taste-button" onClick={() => { setDraftState('skipped'); setDraftError(''); setDraftMessage('Editing the saved collection. Your private draft has not been loaded or changed.') }} type="button">Edit saved collection</button>
      </div>
    </div> : null}
    {!versionChoice ? <>
    <fieldset disabled={busy || !draftReady} className="taste-form"><div className="taste-editor-grid"><div className="taste-form"><label>Collection name<input ref={collectionName} maxLength={120} value={input.name} onChange={e => setInput({ ...input, name: e.target.value })} /></label><label>Introduction<textarea value={input.description ?? ''} onChange={e => setInput({ ...input, description: e.target.value || null })} maxLength={2000} /></label></div><div className="taste-form"><label>Presentation<select value={input.layout.preset} onChange={e => patchLayout({ preset: e.target.value as TasteListLayout['preset'] })}><option value="collection">Collection</option><option value="ranking">Ranking</option><option value="watch-order">Watch order</option></select></label><label>Visibility<select aria-label="Visibility" aria-describedby={visibilityHelpId} disabled={!data.viewerIsOwner} value={input.visibility} onChange={e => setInput({ ...input, visibility: e.target.value as TasteListWrite['visibility'] })}><option value="public">Public</option><option value="unlisted">Unlisted — anyone with the link</option><option value="private">Private — you and invited editors</option></select><span className="taste-muted" id={visibilityHelpId}>{visibilityGuidance}</span></label><fieldset aria-describedby={genreHelpId} className="taste-genre-picker"><legend>Genre tags</legend><p className="taste-muted" id={genreHelpId} role="status">{input.layout.genres.length} of 3 selected.{input.layout.genres.length === 3 ? ' Remove a genre to choose another.' : ' Choose up to three.'}</p><div className="taste-genre-options">{tasteListLayoutSchema.shape.genres.unwrap().element.options.map(genre => {
      const checked = input.layout.genres.includes(genre), disabled = !checked && input.layout.genres.length === 3
      return <label className="taste-genre-option" data-disabled={disabled} data-selected={checked} key={genre}><input checked={checked} disabled={disabled} onChange={event => toggleGenre(genre, event.target.checked)} type="checkbox" />{genre}</label>
    })}</div></fieldset><label>Cover title<select value={input.layout.cover ? titleKey(input.layout.cover) : ''} onChange={e => patchLayout({ cover: input.items.find(item => titleKey(item) === e.target.value) ?? null })}><option value="">Automatic artwork</option>{input.items.map(item => <option key={titleKey(item)} value={titleKey(item)}>{map.get(titleKey(item))?.title ?? `${item.kind} #${item.id}`}</option>)}</select></label></div></div>
    <div className="taste-editor-grid"><section><h2 className="scroll-mt-24 rounded-control outline-none focus:ring-2 focus:ring-[var(--fs-focus)]" id="collection-title-search" tabIndex={-1}>Add titles</h2><TitlePicker maxSelected={500} selected={input.items} onPick={addTitle} />{input.items.length ? <a className="taste-button mt-4" href="#collection-titles">Review selected titles</a> : null}</section><section><h2>Chapters</h2><p className="taste-muted" id={chapterRemovalHelpId}>Removing a chapter keeps its titles and moves them to Opening titles. You can undo the most recent chapter removal before leaving.</p><form aria-label="Add chapter" className="taste-toolbar" onSubmit={event => { event.preventDefault(); addChapter() }}><p aria-label="Chapter capacity" className="basis-full taste-muted" id={chapterCapacityId} role="status">{input.layout.chapters.length} of 30 chapters.{input.layout.chapters.length >= 30 ? ' Remove a chapter to add another.' : ''}</p><input aria-describedby={chapterCapacityId} ref={newChapterName} aria-label="New chapter name" value={chapterName} maxLength={100} onChange={e => setChapterName(e.target.value)} placeholder="A chapter, a mood, a turning point…" /><button aria-describedby={chapterCapacityId} className="taste-button" disabled={!chapterName.trim() || input.layout.chapters.length >= 30} type="submit"><Plus size={16} />Add chapter</button></form><div className={chapterMessage ? 'taste-notice taste-form' : undefined}><p aria-label="Chapter changes" role="status">{chapterMessage}</p>{removedChapter ? <div className="taste-actions"><button aria-label={`Undo removing chapter ${removedChapter.chapter.name || 'Unnamed chapter'}`} className="taste-button" disabled={input.layout.chapters.length >= 30} onClick={undoChapterRemoval} type="button">Undo chapter removal</button>{input.layout.chapters.length >= 30 ? <p className="taste-muted">The collection has reached its 30-chapter limit.</p> : null}</div> : null}</div>{input.layout.chapters.map((chapter, index) => <div aria-label={`Chapter ${index + 1}: ${chapter.name || 'Unnamed chapter'}`} className="taste-form taste-editor-chapter rounded-control outline-none focus:ring-2 focus:ring-[var(--fs-focus)]" key={chapter.id} ref={node => { if (node) reorderNodes.current.set(`chapter:${chapter.id}`, node); else reorderNodes.current.delete(`chapter:${chapter.id}`) }} role="group" tabIndex={-1}>
      <div className="taste-order-row">
        <input aria-label={`Chapter ${index + 1} name`} aria-invalid={!chapter.name.trim()} aria-describedby={!chapter.name.trim() ? `collection-chapter-${chapter.id}-error` : undefined} value={chapter.name} maxLength={100} onChange={e => patchLayout({ chapters: input.layout.chapters.map(c => c.id === chapter.id ? { ...c, name: e.target.value } : c) })} />
        <button className="taste-icon" disabled={!index} aria-label={`Move ${chapter.name} up`} onClick={() => moveChapter(index, -1)} type="button"><ArrowUp size={16} /></button>
        <button className="taste-icon" disabled={index === input.layout.chapters.length - 1} aria-label={`Move ${chapter.name} down`} onClick={() => moveChapter(index, 1)} type="button"><ArrowDown size={16} /></button>
        <button className="taste-icon" aria-label={`Remove ${chapter.name}`} aria-describedby={chapterRemovalHelpId} onClick={() => removeChapter(index)} type="button"><X size={16} /></button>
      </div>
      {!chapter.name.trim() ? <p id={`collection-chapter-${chapter.id}-error`} className="text-[var(--fs-danger)]">Name this chapter before saving the collection.</p> : null}
      <textarea aria-label={`${chapter.name} introduction`} value={chapter.introduction} maxLength={500} onChange={e => patchLayout({ chapters: input.layout.chapters.map(c => c.id === chapter.id ? { ...c, introduction: e.target.value } : c) })} placeholder="Introduce this chapter…" />
    </div>)}</section></div>
    <section><h2 className="scroll-mt-24 rounded-control outline-none focus:ring-2 focus:ring-[var(--fs-focus)]" id="collection-titles" ref={titlesHeading} tabIndex={-1}>{input.items.length} titles, your order</h2><a className="taste-button mb-4" href="#collection-title-search">Find titles</a>
    <div className={changesMessage ? 'taste-notice taste-form' : undefined}><p aria-label="Collection changes" role="status">{changesMessage}</p>{removedTitle ? <div className="taste-form"><p className="taste-muted">You can undo the most recent removal before leaving.{input.items.length >= 500 ? ' The collection has reached its 500-title limit.' : ''}</p><div className="taste-actions"><button aria-label={`Undo removing ${map.get(titleKey(removedTitle.item))?.title ?? `${kindLabel(removedTitle.item.kind)} #${removedTitle.item.id}`}`} className="taste-button" disabled={input.items.length >= 500} onClick={undoTitleRemoval} type="button">Undo removal</button></div></div> : null}</div>{input.items.map((item, index) => <article aria-label={`Position ${index + 1} of ${input.items.length}: ${map.get(titleKey(item))?.title ?? `${kindLabel(item.kind)} #${item.id}`}`} className="taste-list-row rounded-control outline-none focus:ring-2 focus:ring-[var(--fs-focus)]" key={titleKey(item)} ref={node => { if (node) reorderNodes.current.set(`title:${titleKey(item)}`, node); else reorderNodes.current.delete(`title:${titleKey(item)}`) }} tabIndex={-1}><span>{index + 1}</span><TastePoster small refValue={item} title={map.get(titleKey(item))} /><div><h3>{map.get(titleKey(item))?.title ?? `${item.kind} #${item.id}`}</h3><textarea aria-label={`Note for ${map.get(titleKey(item))?.title ?? item.id}`} value={item.note ?? ''} maxLength={500} onChange={e => setInput({ ...input, items: input.items.map((x, i) => i === index ? { ...x, note: e.target.value || null } : x) })} placeholder="Why does this belong?" /><select aria-label="Chapter" value={input.layout.assignments[titleKey(item)] ?? ''} onChange={e => assignChapter(item, e.target.value)}><option value="">Opening titles</option>{input.layout.chapters.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><div className="taste-actions"><button className="taste-icon" disabled={!index} aria-label={`Move ${map.get(titleKey(item))?.title ?? `${kindLabel(item.kind)} #${item.id}`} up`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button className="taste-icon" disabled={index === input.items.length - 1} aria-label={`Move ${map.get(titleKey(item))?.title ?? `${kindLabel(item.kind)} #${item.id}`} down`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button className="taste-button" onClick={() => remove(index)}>Remove</button></div></div></article>)}{input.items.length > 20 ? <a className="taste-button mt-4" href="#collection-title-search">Back to title search</a> : null}</section>
    {data.viewerIsOwner && input.visibility === 'public' ? <label className="taste-check"><input type="checkbox" checked={input.publishUpdate} onChange={e => setInput({ ...input, publishUpdate: e.target.checked })} />Publish this update to followers and subscribers</label> : null}</fieldset>
    {error || accessLost ? <div className="taste-status taste-form rounded-control outline-none focus:ring-2 focus:ring-[var(--fs-focus)]" ref={errorRegion} role="alert" tabIndex={-1}>
      {error ? <p>{error}</p> : null}
      {accessLost ? <p className="max-w-[70ch] text-[var(--fs-ink)]"><strong>You can no longer save changes to this collection.</strong> The collection or your editing permissions may have changed. Your edits are still here. {draftState === 'ready' ? 'You can save a private draft or download a copy before leaving.' : 'Download a copy before leaving.'}</p> : null}
      <div className="taste-actions">
        {accessLost ? <button className="taste-button taste-button-primary" disabled={busy} onClick={() => void reviewLatest()} type="button">{saving === 'latest' ? 'Checking editing access…' : 'Check editing access'}</button> : null}
        {conflict ? <button className="taste-button taste-button-primary" disabled={busy} onClick={() => void reviewLatest()} type="button">{saving === 'latest' ? 'Checking latest version…' : 'Review latest changes'}</button> : null}
        <button className="taste-button" onClick={downloadDraft} type="button">Download my draft</button>
        {!accessLost ? <a className="taste-button" href={`/lists/${data.list.slug}/edit`}>Reload latest</a> : null}
      </div>
    </div> : null}
    {!accessLost ? <CollectionManagement data={data} /> : null}<div className="taste-editor-bar"><button className="taste-button" disabled={busy || draftState !== 'ready'} onClick={() => void saveDraft()}>{saving === 'draft' ? 'Saving private draft…' : 'Save private draft'}</button><Link className="taste-button" href={accessLost ? '/lists' : `/lists/${data.list.slug}`}>{accessLost ? 'Your collections' : 'Cancel'}</Link><button className="taste-button taste-button-primary" disabled={busy || accessLost || !draftReady || !input.name.trim() || input.layout.chapters.some(chapter => !chapter.name.trim())} onClick={() => void save()}>{saving === 'collection' ? 'Saving collection…' : input.publishUpdate ? 'Save & publish update' : 'Save collection'}</button></div>
    </> : null}
  </main></FilScreenShell>
}

export function NewCollection() {
  const router = useRouter(), [name, setName] = useState(''), [preset, setPreset] = useState('collection'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [key] = useState(() => crypto.randomUUID())
  const pending = useRef(false)
  async function create() {
    if (pending.current || !name.trim()) return
    pending.current = true; setBusy(true); setError('')
    try {
      const data = await createMemberList({ name: name.trim(), visibility: 'private', idempotencyKey: key })
      router.push(`/lists/${data.list.slug}/edit?preset=${preset}`)
    } catch (cause) { setError(errorText(cause)); pending.current = false; setBusy(false) }
  }
  return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-reading taste-new-collection">
    <h1>Start with an idea.</h1>
    <p className="taste-empty">A mood. Your definitive ranking. A way into a world you love.</p>
    <form aria-label="New collection" onSubmit={event => { event.preventDefault(); void create() }}>
      <fieldset aria-busy={busy} className="taste-form" disabled={busy}>
        <label>Name your collection<input autoComplete="off" maxLength={120} onChange={event => setName(event.target.value)} placeholder="Films for the last train home" required value={name} /></label>
        <label>How should people explore it?<select onChange={event => setPreset(event.target.value)} value={preset}><option value="collection">Collection — a set of connected titles</option><option value="ranking">Ranking — every position means something</option><option value="watch-order">Watch order — a deliberate journey</option></select></label>
        <p className="taste-muted">Your collection starts private. Add titles and choose its visibility in the editor.</p>
        {error ? <p role="alert">{error}</p> : null}
        <button className="taste-button taste-button-primary" disabled={busy || !name.trim()} type="submit">{busy ? 'Creating…' : 'Build your collection'}</button>
      </fieldset>
    </form>
  </main></FilScreenShell>
}
