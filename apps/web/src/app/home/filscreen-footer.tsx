import { ArrowUpRight } from 'lucide-react'
import Image from 'next/image'

import { OnDemandLink as Link } from '../shared/on-demand-link'

const LINK_CLASS = 'inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm text-[var(--fs-secondary)] underline-offset-4 outline-none transition-colors duration-150 hover:text-[var(--fs-ink)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none'
const CREDIT_CLASS = 'inline-flex min-h-11 items-center gap-1 rounded-control font-medium text-[var(--fs-secondary)] underline decoration-[var(--fs-line)] underline-offset-4 outline-none transition-colors duration-150 hover:text-[var(--fs-accent)] hover:decoration-current focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none'

/** Catalog provenance stays at the content boundary, beside the desktop rail. */
export function FilScreenFooter() {
  return (
    <footer aria-label="Consumit" className="mx-5 mt-5 border-t border-[var(--fs-line)] pb-5 pt-6 sm:mx-6 lg:mx-8 lg:mt-8 lg:pb-6 lg:pt-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-center gap-3">
          <Image alt="" className="size-9 shrink-0" height={36} src="/assets/consumit-mark.svg" width={36} />
          <div>
            <p className="text-sm font-bold tracking-[0.16em] text-[var(--fs-ink)]">CONSUMIT</p>
            <p className="mt-1 font-display text-xl leading-snug text-[var(--fs-secondary)]">Remember what you love.</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <Link className={LINK_CLASS} href="/about">About</Link>
          <Link className={LINK_CLASS} href="/help">Help center</Link>
          <Link className={LINK_CLASS} href="/terms">Terms</Link>
          <Link className={LINK_CLASS} href="/privacy">Privacy</Link>
          <Link className={LINK_CLASS} href="/dmca">DMCA</Link>
          <Link className={LINK_CLASS} href="/about#catalog-credit">Catalog credits <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
        </nav>
      </div>
      <div className="mt-5 flex flex-col gap-1 border-t border-[var(--fs-line)] pt-3 text-xs text-[var(--fs-muted)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-1">
        <p className="py-2">© 2026 Consumit</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-0">
          <p>Movie and series metadata by <a className={CREDIT_CLASS} href="https://www.themoviedb.org" rel="noreferrer" target="_blank">TMDB <ArrowUpRight aria-hidden="true" className="size-3" /></a></p>
          <p>Anime metadata by <a className={CREDIT_CLASS} href="https://anilist.co" rel="noreferrer" target="_blank">AniList <ArrowUpRight aria-hidden="true" className="size-3" /></a></p>
        </div>
      </div>
    </footer>
  )
}
