import type { PublicListDiscoveryItem } from '@consumit/contracts'
import { CuratedListCard, SectionHeading } from '@consumit/ui'

type HomeListCard = PublicListDiscoveryItem & { artworkSources: readonly (string | undefined)[] }

export function PublicListRail({ id, items, title }: { id: string; items: readonly HomeListCard[]; title: string }) {
  if (!items.length) return null
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8">
      <SectionHeading id={`${id}-heading`} title={title} />
      <ul aria-label={`${title} lists`} className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 fs-noscroll sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3" role="region" tabIndex={0}>
        {items.slice(0, 3).map(({ artworkSources, list, owner }) => (
          <li className="w-[82vw] shrink-0 snap-start sm:w-auto" key={list.id}>
            <CuratedListCard
              artworkSources={artworkSources}
              curator={owner.displayName ?? owner.username}
              href={`/lists/${encodeURIComponent(list.slug)}`}
              meta={`${list.itemCount} ${list.itemCount === 1 ? 'title' : 'titles'}`}
              title={list.name}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
