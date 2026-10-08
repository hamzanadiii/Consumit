'use client'
import { ConsumitPlayer } from '@consumit/next-ui'
import type { CatalogTitleSummary } from '@consumit/contracts'
import Link from 'next/link'
export function DesignLabPlayer({ title }: { title: CatalogTitleSummary }) {
  return <main className="next-player-lab"><header><Link href="/design-lab?surface=home">Return to discovery</Link><h1>{title.title}</h1><p>Local demonstration video · no provider or member writes</p></header><ConsumitPlayer title={title.title} src="/assets/demo-playback.mp4" posterSrc={title.backdropUrl ?? undefined} preload="metadata" pauseFacts={[title.year, 'Sample video'].join(' · ')} pauseOverview={title.overview} /><p>The new controls retain Consumit’s validated playback engine. Quality, audio, subtitles and source recovery are supplied by the real Watch routes.</p></main>
}
