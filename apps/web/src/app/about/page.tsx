import type { Metadata } from 'next'

import { FilScreenShell } from '../home/filscreen-shell'

export const metadata: Metadata = {
  title: 'About · Consumit',
  description: 'About Consumit and the catalog data behind movies, series, and anime.',
}

export default function AboutPage() {
  return (
    <FilScreenShell pageHeading={undefined}>
      <main id="consumit-main-content" tabIndex={-1} className="mx-auto min-h-[70vh] w-full max-w-4xl py-8">
        <h1 className="text-balance font-display text-[clamp(2.75rem,6.5vw,5rem)] leading-[0.92] tracking-[-0.025em] text-ink">Made for people who care what they watch.</h1>
        <p className="mt-7 max-w-[68ch] text-base leading-7 text-copy">
          Consumit brings discovery, memory, and authorized playback into one calm place. Your saves, progress, reviews, and lists live in your personal profile.
        </p>
        <section className="mt-16 border-t border-border pt-10" aria-labelledby="catalog-credit">
          <h2 className="scroll-mt-20 font-display text-3xl text-ink" id="catalog-credit">Catalog credits</h2>
          <div className="mt-5 grid gap-8 md:grid-cols-2">
            <section aria-labelledby="tmdb-credit-heading">
              <h3 className="font-semibold text-ink" id="tmdb-credit-heading">Movies and series</h3>
              <p className="mt-3 max-w-[68ch] text-sm leading-6 text-copy">
                Movie, series, season, episode, cast, poster, and backdrop metadata is supplied by The Movie Database (TMDB).
              </p>
              <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink">
                This product uses the TMDB API but is not endorsed or certified by TMDB.
              </p>
              <a className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-orange underline decoration-orange/50 underline-offset-4 hover:text-ink" href="https://www.themoviedb.org" rel="noreferrer" target="_blank">
                Visit TMDB
              </a>
            </section>
            <section aria-labelledby="anilist-credit-heading">
              <h3 className="font-semibold text-ink" id="anilist-credit-heading">Anime</h3>
              <p className="mt-3 max-w-[68ch] text-sm leading-6 text-copy">
                Anime title, episode, and artwork metadata in Consumit comes from AniList.
              </p>
              <a className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-orange underline decoration-orange/50 underline-offset-4 hover:text-ink" href="https://anilist.co" rel="noreferrer" target="_blank">
                Visit AniList
              </a>
            </section>
          </div>
        </section>
      </main>
    </FilScreenShell>
  )
}
