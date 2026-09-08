import { titleHref, type CatalogRef, type CatalogTitleSummary, type MemberListDetail } from '@consumit/contracts'
import Image from 'next/image'
import Link from 'next/link'

import { OrderedTitleRow, SectionHeading, Tabs, buttonVariants } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'

function key(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

export function ListDetailScreen({ catalogUnavailable = false, data, titles }: { catalogUnavailable?: boolean; data: MemberListDetail; titles: readonly CatalogTitleSummary[] }) {
  const titleMap = new Map(titles.map((title) => [key(title), title]))
  return (
    <ScreenShell activeHref="/lists">
      <main className="mx-auto min-h-screen w-full max-w-[90rem]" data-consumit-list-detail data-list-slug={data.list.slug}>
        <section className="overflow-hidden border-b border-border px-5 py-14 sm:px-8 lg:px-[62px] lg:py-24"><div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(27rem,1.05fr)] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-orange">{data.list.visibility} list</p><h1 className="mt-4 max-w-[12ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5rem]">{data.list.name}</h1>{data.list.description ? <p className="mt-6 max-w-[58ch] whitespace-pre-wrap text-sm leading-7 text-copy">{data.list.description}</p> : null}<p className="mt-7 text-sm text-muted">By <Link className="font-bold text-ink hover:text-orange" href={`/profile/${data.owner.username}`}>{data.owner.displayName ?? data.owner.username}</Link> · {data.items.length} titles</p></div><div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-2xl sm:h-96">{data.items.slice(0, 4).map((item, index) => { const title = titleMap.get(key(item)); return title?.posterUrl ? <Image alt="" className="absolute bottom-0 left-1/2 aspect-[2/3] h-[88%] w-auto rounded-card border border-border object-cover" height={600} key={key(item)} src={title.posterUrl} style={{ transform: `translateX(calc(-50% + ${(index - 1.5) * 22}%)) rotate(${(index - 1.5) * 4}deg)`, zIndex: index }} width={400} /> : null })}</div></div></section>
        <div className="px-5 sm:px-8 lg:px-[62px]"><Tabs activeValue="titles" aria-label="List sections" items={[{ count: data.items.length, href: '#titles', label: 'Titles', value: 'titles' }, { href: '#about', label: 'About', value: 'about' }]} />{catalogUnavailable ? <p className="mt-8 rounded-control border border-border bg-surface p-4 text-xs text-muted">The list is available, but TMDB title details could not load.</p> : null}<section className="py-14 sm:py-16 lg:py-20" id="titles"><SectionHeading description="The member's order and notes are preserved." id="list-titles-heading" title="The list, in order" />{data.items.length === 0 ? <p className="mt-8 rounded-card border border-dashed border-border bg-surface p-8 text-sm text-muted">This list is empty.</p> : <div className="mt-8 space-y-3">{data.items.map((item) => { const title = titleMap.get(key(item)); return <OrderedTitleRow action={<Link className={buttonVariants({ size: 'sm', variant: 'secondary' })} href={titleHref(item)}>View</Link>} artworkSrc={title?.posterUrl ?? undefined} href={titleHref(item)} index={item.position} key={`${item.position}:${key(item)}`} meta={title?.year ? String(title.year) : 'Catalog details unavailable'} quote={item.note ?? undefined} title={title?.title ?? `${item.kind === 'movie' ? 'Movie' : 'Series'} #${item.id}`} /> })}</div>}</section><section className="border-t border-border py-14" id="about"><SectionHeading id="list-about-heading" title="About this list" /><p className="mt-6 max-w-2xl text-sm leading-7 text-muted">This is real member-owned list data. Conversation and collaboration will remain empty until the social slice is built.</p></section></div>
      </main>
    </ScreenShell>
  )
}
