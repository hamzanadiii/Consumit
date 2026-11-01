'use client'

import { useEffect, useId, useRef } from 'react'
import { kindLabel, type CatalogRef, type CatalogTitleSummary, type TasteListWrite } from '@consumit/contracts'
import { titleKey } from './primitives'

export type CollectionVersionChoiceState = {
  latest: TasteListWrite
  working: TasteListWrite
  source: 'draft' | 'conflict' | 'access'
  draftLoaded: boolean
}

export function CollectionVersionChoice({ latest, working, source, titles, onLatest, onWorking }: CollectionVersionChoiceState & {
  titles: readonly CatalogTitleSummary[]
  onLatest: () => void
  onWorking: () => void
}) {
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [])
  const titleMap = new Map(titles.map(title => [titleKey(title), title.title]))
  const label = (ref: CatalogRef) => titleMap.get(titleKey(ref)) ?? `${kindLabel(ref.kind)} #${ref.id}`
  const workingLabel = source === 'draft' ? 'Your private draft' : 'Your unsaved edits'
  function items(value: TasteListWrite) {
    return value.items.map((item, index) => `${index + 1}. ${label(item)}${item.note ? `\nNote: ${item.note}` : ''}`).join('\n\n') || 'No titles'
  }
  function chapters(value: TasteListWrite) {
    const chapterMap = new Map(value.layout.chapters.map(chapter => [chapter.id, chapter.name]))
    return [
      ...value.layout.chapters.map(chapter => `${chapter.name}${chapter.introduction ? `\n${chapter.introduction}` : ''}`),
      ...Object.entries(value.layout.assignments).sort(([a], [b]) => a.localeCompare(b)).map(([key, chapter]) => {
        const item = value.items.find(ref => titleKey(ref) === key)
        return `${item ? label(item) : key} → ${chapterMap.get(chapter) ?? chapter}`
      }),
    ].join('\n\n') || 'No chapters'
  }
  const presentation = { collection: 'Collection', ranking: 'Ranking', 'watch-order': 'Watch order' }
  const rows = [
    { name: 'Name', latest: latest.name, working: working.name },
    { name: 'Introduction', latest: latest.description ?? '', working: working.description ?? '' },
    { name: 'Visibility', latest: latest.visibility, working: working.visibility },
    { name: 'Presentation', latest: presentation[latest.layout.preset], working: presentation[working.layout.preset] },
    { name: 'Genre tags', latest: latest.layout.genres.join(', '), working: working.layout.genres.join(', ') },
    { name: 'Cover', latest: latest.layout.cover ? label(latest.layout.cover) : 'Automatic artwork', working: working.layout.cover ? label(working.layout.cover) : 'Automatic artwork' },
    { name: 'Titles, order and notes', latest: items(latest), working: items(working) },
    { name: 'Chapters and assignments', latest: chapters(latest), working: chapters(working) },
  ].filter(row => row.latest !== row.working)

  return <section aria-labelledby={headingId} className="taste-version-choice">
    <h2 className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" id={headingId} ref={heading} tabIndex={-1}>Choose which version to edit.</h2>
    <p>{source === 'draft' ? 'The saved collection changed after this private draft was started.' : source === 'access' ? 'You can edit this collection again.' : 'Another save changed this collection while you were editing.'} Your work is still here.</p>
    {rows.length ? <details open>
      <summary>Compare {rows.length} changed {rows.length === 1 ? 'field' : 'fields'}</summary>
      {rows.map(row => <section className="taste-version-change" key={row.name}>
        <h3>{row.name}</h3>
        <dl className="taste-version-values">
          <div><dt>Latest saved</dt><dd>{row.latest || 'None'}</dd></div>
          <div><dt>{workingLabel}</dt><dd>{row.working || 'None'}</dd></div>
        </dl>
      </section>)}
    </details> : <p className="taste-muted">These versions have the same collection content.</p>}
    <p className="taste-muted">Choose a starting point below. Using your {source === 'draft' ? 'draft' : 'edits'} puts those values into the editor; Save collection will replace the latest saved fields. Nothing is replaced by this choice alone.</p>
    <div className="taste-actions">
      <button className="taste-button" onClick={onLatest} type="button">Edit latest collection</button>
      <button className="taste-button taste-button-primary" onClick={onWorking} type="button">{source === 'draft' ? 'Use my draft' : 'Keep my edits'}</button>
    </div>
  </section>
}
