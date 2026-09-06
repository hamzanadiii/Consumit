'use client'

import { Bookmark, Check, Play, Share2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import {
  Badge,
  Button,
  CommentCard,
  CuratedListCard,
  CuratorPanel,
  OrderedTitleRow,
  SectionHeading,
  SocialProof,
  Tabs,
  TasteMatch,
  buttonVariants,
} from '@consumit/ui'

import { ScreenShell, artwork, circle } from '../screens/screen-shell'

const orderedTitles = [
  { match: 96, meta: '2026 · Mystery · 2h 08m', note: 'A city keeps the memory when its people cannot.', src: artwork.northbound, title: 'The Last City After Rain' },
  { match: 93, meta: '2021 · Sci-fi · 2h 14m', note: 'The future arrives as a recollection you almost recognize.', src: artwork.thirdSun, title: 'Third Sun' },
  { match: 91, meta: '2025 · Drama · 1h 52m', note: 'Grief moves like water and refuses a straight line.', src: artwork.saltwater, title: 'Sea of Names' },
  { match: 89, meta: '2023 · Mystery · 1h 47m', note: 'A homecoming built from rooms that no longer exist.', src: artwork.violetHours, title: 'The Returning' },
  { match: 86, meta: '2024 · Drama · 1h 58m', note: 'A roadside room, a borrowed name, one sleepless night.', src: artwork.northbound, title: 'Atlas Motel' },
  { match: 83, meta: '2024– · Series · 8 episodes', note: 'Every shoreline keeps a different version of you.', src: artwork.saltwater, title: 'Saltwater' },
] as const

function titleFromSlug(slug: string) {
  return slug === 'films-that-feel-like-a-memory'
    ? 'Films that feel like a memory'
    : slug.split('-').filter(Boolean).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ')
}

export function ListDetailScreen({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false)
  const title = titleFromSlug(slug)

  return (
    <ScreenShell activeHref="/lists">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-list-detail data-list-slug={slug}>
        <section className="overflow-hidden border-b border-border px-5 py-14 sm:px-8 sm:py-18 lg:px-[62px] lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(27rem,1.05fr)] lg:items-center">
            <div>
              <h1 className="max-w-[12ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5rem]">{title}</h1>
              <p className="mt-6 max-w-[58ch] text-sm leading-7 text-copy">Movies that return like a half-remembered room: strange, intimate, and impossible to shake.</p>
              <SocialProof className="mt-7" detail="Last revised 2 days ago · 18 titles" items={circle} label="Yasmine, Omar, and Nadia curated this list" text={<strong className="text-ink">Curated by Yasmine with Omar and Nadia</strong>} />
              <div className="mt-8 flex flex-wrap gap-3">
                <Button aria-pressed={saved} onClick={() => setSaved((current) => !current)} variant={saved ? 'secondary' : 'primary'}>
                  {saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                  {saved ? 'Saved' : 'Save list'}
                </Button>
                <Button variant="secondary"><Share2 aria-hidden="true" /> Share</Button>
              </div>
              <dl className="mt-9 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-6">
                <div><dt className="text-xs text-muted">Saves</dt><dd className="mt-1 text-sm font-bold tabular-nums text-ink">1,204</dd></div>
                <div><dt className="text-xs text-muted">Average match</dt><dd className="mt-1 text-sm font-bold tabular-nums text-lilac">89%</dd></div>
                <div><dt className="text-xs text-muted">Total runtime</dt><dd className="mt-1 text-sm font-bold tabular-nums text-ink">34h 12m</dd></div>
              </dl>
            </div>
            <div aria-hidden="true" className="relative mx-auto h-72 w-full max-w-2xl sm:h-96">
              {[artwork.violetHours, artwork.saltwater, artwork.thirdSun, artwork.northbound].map((src, index) => (
                <Image
                  alt=""
                  className="absolute bottom-0 left-1/2 aspect-[2/3] h-[88%] rounded-card border border-border object-cover"
                  height={600}
                  key={src}
                  src={src}
                  style={{ transform: `translateX(calc(-50% + ${(index - 1.5) * 22}%)) rotate(${(index - 1.5) * 4}deg)`, zIndex: index }}
                  width={400}
                />
              ))}
            </div>
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs activeValue="titles" aria-label="List sections" items={[
            { count: 18, href: '#titles', label: 'Titles', value: 'titles' },
            { href: '#about', label: 'About', value: 'about' },
            { count: 14, href: '#conversation', label: 'Conversation', value: 'conversation' },
            { href: '#more-lists', label: 'More like this', value: 'more' },
          ]} />

          <section className="py-14 sm:py-16 lg:py-20" id="titles" aria-labelledby="list-titles-heading">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-14">
              <div className="min-w-0">
                <SectionHeading description="Curator order is preserved; evidence and actions never replace the note." id="list-titles-heading" title="The list, in order" />
                <div className="mt-8 space-y-3">
                  {orderedTitles.map((item, index) => (
                    <OrderedTitleRow
                      action={<Link className={buttonVariants({ size: 'sm', variant: index === 0 ? 'primary' : 'secondary' })} href={index === 0 ? '/watch/the-last-city-after-rain' : `/title/${item.title.toLowerCase().replaceAll(' ', '-')}`} prefetch={false}>{index === 0 ? <><Play aria-hidden="true" /> Play</> : 'View'}</Link>}
                      artworkSrc={item.src}
                      href={`/title/${item.title.toLowerCase().replaceAll(' ', '-')}`}
                      index={index + 1}
                      key={item.title}
                      match={item.match}
                      meta={item.meta}
                      proof={index < 3 ? 'Three people in your circle loved this' : 'Saved by people with similar taste'}
                      quote={item.note}
                      title={item.title}
                    />
                  ))}
                </div>
                <div className="mt-6 rounded-card border border-border bg-surface p-6 text-center">
                  <p className="text-sm font-bold text-ink">12 more titles preserve the curator’s original order.</p>
                  <p className="mt-2 text-xs text-muted">This static slice shows the first six entries.</p>
                  <Button className="mt-5" variant="secondary">Show all 18</Button>
                </div>
              </div>

              <aside className="space-y-5 xl:sticky xl:top-7 xl:self-start" aria-label="About this list" id="about">
                <CuratorPanel
                  curators={[
                    { detail: '12 selections', name: 'Yasmine El Idrissi', role: 'Owner' },
                    { detail: '4 selections', name: 'Omar Benjelloun', role: 'Collaborator' },
                    { detail: '2 selections', name: 'Nadia Alaoui', role: 'Collaborator' },
                  ]}
                  description="Built slowly over two years. Every title has to feel remembered before it feels understood."
                  tags={['Memory', 'Cities', 'Dream logic', 'Slow burn']}
                />
                <section className="rounded-card border border-border bg-surface p-5">
                  <h2 className="text-sm font-bold text-ink">Why this fits you</h2>
                  <TasteMatch className="mt-5" detail="You saved 7 of the first 10 titles" reason="Quiet mysteries, emotional architecture, patient endings" score={94} />
                </section>
                <section className="rounded-card border border-border bg-surface p-5">
                  <h2 className="text-sm font-bold text-ink">List signals</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone="lilac">12 circle saves</Badge>
                    <Badge tone="lime">87% finish rate</Badge>
                    <Badge tone="orange">Updated</Badge>
                  </div>
                </section>
              </aside>
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="conversation" aria-labelledby="conversation-heading">
            <SectionHeading description="Public, asynchronous discussion about the list. Spoilers stay behind disclosure." id="conversation-heading" title="Conversation around the list" />
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <CommentCard comment="The ordering is perfect until number four. Then it becomes emotionally irresponsible—in a good way." engagement="42 likes · 6 replies" memberHref="/profile/adam" memberName="Adam Rouissi" meta="Yesterday" />
              <CommentCard comment="The third title changes how the final title lands. Don’t skip ahead." engagement="31 likes · 4 replies" memberHref="/profile/nadia" memberName="Nadia Alaoui" meta="Two days ago" roleLabel="Curator" spoilerHidden />
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-14 sm:py-16 lg:py-20" id="more-lists" aria-labelledby="more-lists-heading">
            <SectionHeading description="Different routes into the same late-night feeling." id="more-lists-heading" title="More lists to keep nearby" />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <CuratedListCard artworkSources={[artwork.saltwater, artwork.northbound, artwork.thirdSun, artwork.violetHours]} curator="Omar" href="/lists/one-perfect-film-for-every-mood" saves="846" title="One perfect film for every mood" />
              <CuratedListCard artworkSources={[artwork.thirdSun, artwork.violetHours, artwork.saltwater, artwork.northbound]} curator="Nadia" href="/lists/beautifully-strange" saves="633" title="Beautifully strange and worth it" />
              <CuratedListCard artworkSources={[artwork.violetHours, artwork.saltwater, artwork.northbound, artwork.thirdSun]} curator="Leila" href="/lists/cities-that-remember-too-much" saves="519" title="Cities that remember too much" />
            </div>
          </section>
        </div>
      </main>
    </ScreenShell>
  )
}
