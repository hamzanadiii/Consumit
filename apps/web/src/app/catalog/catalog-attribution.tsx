import Image from 'next/image'

const tmdbLogo = 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg'

export function CatalogAttribution() {
  return (
    <aside className="border-t border-border bg-nav px-5 py-4 sm:px-8" aria-label="Catalog attribution">
      <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[0.6875rem] text-muted">Movie and series metadata provided by</span>
        <a
          className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-orange"
          href="https://www.themoviedb.org"
          rel="noreferrer"
          target="_blank"
        >
          <Image alt="The Movie Database (TMDB)" className="h-4 w-auto" height={37} src={tmdbLogo} width={94} />
        </a>
        <a className="ml-auto text-[0.6875rem] text-muted underline decoration-border underline-offset-4 hover:text-ink" href="/about">
          Catalog credits
        </a>
      </div>
    </aside>
  )
}

export function CatalogPreviewNotice() {
  return (
    <p className="border-b border-border bg-surface px-5 py-2.5 text-center text-[0.6875rem] leading-5 text-muted sm:px-8" data-consumit-preview-notice role="note">
      Prototype preview: Taste Match, member activity, ratings, and progress are deterministic sample data.
    </p>
  )
}
