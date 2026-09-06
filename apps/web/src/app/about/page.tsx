import type { Metadata } from 'next'

import { ScreenShell } from '../screens/screen-shell'

export const metadata: Metadata = {
  title: 'About · Consumit',
  description: 'About Consumit and its catalog data source.',
}

export default function AboutPage() {
  return (
    <ScreenShell activeHref="">
      <main className="mx-auto min-h-[70vh] w-full max-w-4xl px-5 py-16 sm:px-8 lg:py-24">
        <h1 className="text-balance font-display text-[clamp(3rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.025em] text-ink">Made for people who care what they watch.</h1>
        <p className="mt-7 max-w-[68ch] text-base leading-7 text-copy">
          Consumit brings discovery, taste, memory, and authorized playback into one calm place. Member ratings, Taste Match, saves, progress, and Circle activity belong to Consumit.
        </p>
        <section className="mt-16 border-t border-border pt-10" aria-labelledby="catalog-credit">
          <h2 className="font-display text-3xl text-ink" id="catalog-credit">Catalog credits</h2>
          <p className="mt-5 max-w-[68ch] text-sm leading-6 text-copy">
            Movie, series, season, episode, cast, poster, and backdrop metadata is supplied by The Movie Database (TMDB).
          </p>
          <p className="mt-4 max-w-[68ch] text-sm leading-6 text-ink">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <a className="mt-7 inline-flex min-h-11 items-center text-sm font-bold text-orange underline decoration-orange/50 underline-offset-4 hover:text-ink" href="https://www.themoviedb.org" rel="noreferrer" target="_blank">
            Visit TMDB
          </a>
        </section>
      </main>
    </ScreenShell>
  )
}
