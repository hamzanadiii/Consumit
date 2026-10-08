import { cn } from '@consumit/next-ui'

export type BrowseHeroProps = {
  /** Catalog backdrops for the collage; missing artwork is skipped. */
  backdrops: readonly (string | null | undefined)[]
  description: string
  title: string
}

const COLLAGE_TILES = 5

/** Bounded artwork masthead for the Movies, Series, and Anime browse screens.
 *  A quiet tile collage carries the mood while the Charter heading and muted
 *  description stay readable on the dark scrim, matching Home's bounded
 *  backdrop masthead rather than a full-bleed banner. */
export function BrowseHero({ backdrops, description, title }: BrowseHeroProps) {
  const tiles = backdrops.filter((src): src is string => Boolean(src)).slice(0, COLLAGE_TILES)
  return (
    <section
      aria-labelledby="browse-hero-heading"
      className="relative overflow-hidden rounded-[6px] border border-[var(--fs-line)] bg-[var(--fs-page)]"
      data-consumit-browse-hero
    >
      <div aria-hidden="true" className="absolute inset-y-0 right-0 grid w-[72%] grid-cols-3 gap-2 p-2 sm:w-[62%] sm:grid-cols-5">
        {tiles.map((src, index) => (
          <div className="overflow-hidden rounded-[4px] bg-[var(--fs-field)]" key={`hero-tile:${index}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative collage thumb avoids Next image overhead */}
            <img alt="" className="size-full object-cover" loading="eager" src={src} />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[var(--fs-page)] from-[30%] via-[var(--fs-page)]/75 via-[62%] to-[var(--fs-page)]/20"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[var(--fs-page)]/70 sm:hidden" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--fs-page)] to-transparent"
      />
      <div className="relative px-5 py-9 sm:px-8 sm:py-12 lg:py-14">
        <h1
          className="font-display text-[2.75rem] leading-tight tracking-[-0.025em] text-[var(--fs-ink)] sm:text-5xl"
          id="browse-hero-heading"
        >
          {title}
          <span className="text-[var(--fs-accent)]">.</span>
        </h1>
        <p className={cn('mt-2 max-w-[46ch] text-sm text-[var(--fs-muted)]')}>{description}</p>
      </div>
    </section>
  )
}
