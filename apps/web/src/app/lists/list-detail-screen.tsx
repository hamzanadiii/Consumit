'use client'

import { titleHref, watchHref, type CatalogTitleSummary } from '@consumit/contracts'
import { Bookmark, Check, Play, Share2 } from 'lucide-react'
import { useState } from 'react'
import Image from 'next/image'

import { Button, CommentCard, CuratedListCard, CuratorPanel, OrderedTitleRow, SectionHeading, SocialProof, Tabs, buttonVariants } from '@consumit/ui'

import { CatalogStaleNotice, titleMeta } from '../catalog/catalog-ui'
import { ScreenShell, circle } from '../screens/screen-shell'

function titleFromSlug(slug: string) {
  return slug === 'films-that-feel-like-a-memory' ? 'Films that feel like a memory' : slug.split('-').filter(Boolean).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ')
}

const notes = ['A place keeps the memory when its people cannot.', 'The future arrives as something you almost recognize.', 'Grief refuses a straight line.', 'A homecoming built from rooms that no longer exist.', 'One sleepless night changes the whole route.', 'Every frame keeps a different version of you.']

export function ListDetailScreen({ slug, stale, titles }: { slug: string; stale: boolean; titles: readonly CatalogTitleSummary[] }) {
  const [saved, setSaved] = useState(false)
  const title = titleFromSlug(slug)
  return (
    <ScreenShell activeHref="/lists">
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-list-detail data-list-slug={slug}>
        <section className="overflow-hidden border-b border-border px-5 py-14 sm:px-8 lg:px-[62px] lg:py-24"><div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(27rem,1.05fr)] lg:items-center"><div><h1 className="max-w-[12ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5rem]">{title}</h1><p className="mt-6 max-w-[58ch] text-sm leading-7 text-copy">Real movies and series that return like a half-remembered room: intimate, strange, and difficult to shake.</p><SocialProof className="mt-7" detail={`Last revised 2 days ago · ${titles.length} titles`} items={circle} label="Yasmine, Omar, and Nadia curated this list" text={<strong className="text-ink">Curated by Yasmine with Omar and Nadia</strong>} /><div className="mt-8 flex flex-wrap gap-3"><Button aria-pressed={saved} onClick={() => setSaved((value) => !value)} variant={saved ? 'secondary' : 'primary'}>{saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{saved ? 'Saved' : 'Save list'}</Button><Button variant="secondary"><Share2 aria-hidden="true" /> Share</Button></div></div><div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-2xl sm:h-96">{titles.slice(0, 4).map((item, index) => item.posterUrl ? <Image alt="" className="absolute bottom-0 left-1/2 aspect-[2/3] h-[88%] w-auto rounded-card border border-border object-cover" height={600} key={`${item.kind}:${item.id}`} src={item.posterUrl} style={{ transform: `translateX(calc(-50% + ${(index - 1.5) * 22}%)) rotate(${(index - 1.5) * 4}deg)`, zIndex: index }} width={400} /> : null)}</div></div></section>
        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs activeValue="titles" aria-label="List sections" items={[{ count: titles.length, href: '#titles', label: 'Titles', value: 'titles' }, { href: '#about', label: 'About', value: 'about' }, { count: 14, href: '#conversation', label: 'Conversation', value: 'conversation' }, { href: '#more-lists', label: 'More like this', value: 'more' }]} />
          <section className="py-14 sm:py-16 lg:py-20" id="titles" aria-labelledby="list-titles-heading"><div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-14"><div><SectionHeading description="The curator’s order and notes are preserved." id="list-titles-heading" title="The list, in order" /><div className="mt-8 space-y-3">{titles.map((item, index) => <OrderedTitleRow action={<a className={buttonVariants({ size: 'sm', variant: index === 0 ? 'primary' : 'secondary' })} href={index === 0 ? watchHref(item) : titleHref(item)}>{index === 0 ? <><Play aria-hidden="true" /> Watch</> : 'View'}</a>} artworkSrc={item.posterUrl ?? undefined} href={titleHref(item)} index={index + 1} key={`${item.kind}:${item.id}`} meta={titleMeta(item)} proof={index < 3 ? 'Three people in your circle saved this' : 'A deliberate part of the curator’s sequence'} quote={notes[index % notes.length]} title={item.title} />)}</div></div><aside className="space-y-5 xl:sticky xl:top-7 xl:self-start" id="about"><CuratorPanel curators={[{ detail: 'Lead selections', name: 'Yasmine El Idrissi', role: 'Owner' }, { detail: 'Contributing', name: 'Omar Benjelloun', role: 'Collaborator' }, { detail: 'Contributing', name: 'Nadia Alaoui', role: 'Collaborator' }]} description="Built slowly over two years. Every title has to feel remembered before it feels understood." tags={['Memory', 'Cities', 'Dream logic', 'Slow burn']} /></aside></div></section>
          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="conversation" aria-labelledby="conversation-heading"><SectionHeading description="Public, asynchronous discussion only. Consumit does not offer private messages." id="conversation-heading" title="Conversation around the list" /><div className="mt-8 grid gap-5 lg:grid-cols-2"><CommentCard comment="The ordering becomes emotionally irresponsible—in a good way." engagement="42 likes · 6 replies" memberHref="/profile/adam" memberName="Adam Rouissi" meta="Yesterday" /><CommentCard comment="The third title changes how the final title lands. Don’t skip ahead." engagement="31 likes · 4 replies" memberHref="/profile/nadia" memberName="Nadia Alaoui" meta="Two days ago" roleLabel="Curator" spoilerHidden /></div></section>
          <section className="border-t border-border py-14 sm:py-16 lg:py-20" id="more-lists" aria-labelledby="more-lists-heading"><SectionHeading description="Different routes into the same late-night feeling." id="more-lists-heading" title="More lists to keep nearby" /><div className="mt-8 grid gap-5 md:grid-cols-3">{['Omar', 'Nadia', 'Leila'].map((curator, index) => <CuratedListCard artworkSources={titles.slice(index, index + 4).map((item) => item.posterUrl ?? undefined)} curator={curator} href="/lists/films-that-feel-like-a-memory" key={curator} saves={String(519 + index * 107)} title={['One perfect film for every mood', 'Beautifully strange and worth it', 'Cities that remember too much'][index] ?? 'A member list'} />)}</div></section>
        </div>
      </main>
    </ScreenShell>
  )
}
