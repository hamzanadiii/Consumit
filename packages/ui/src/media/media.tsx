import type { ComponentProps, ReactNode } from 'react'
import { Play } from 'lucide-react'

import { cn } from '../lib/cn'
import { Badge } from '../signals/signals'

const ratioClasses = {
  landscape: 'aspect-video',
  portrait: 'aspect-[2/3]',
  square: 'aspect-square',
  wide: 'aspect-[2.15/1]',
} as const

export type ArtworkRatio = keyof typeof ratioClasses

export type MissingArtworkProps = Omit<ComponentProps<'div'>, 'children'> & {
  label?: string | undefined
}

export function MissingArtwork({
  className,
  label = 'Artwork unavailable',
  ...props
}: MissingArtworkProps) {
  return (
    <div
      aria-label={label}
      className={cn(
        'relative size-full overflow-hidden bg-[linear-gradient(145deg,#263f45_0_38%,#2b2439_39%_68%,#141419_69%_100%)]',
        className,
      )}
      data-consumit-missing-artwork
      role="img"
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute top-[18%] left-[58%] size-[18%] rounded-full border border-ink/35"
      />
      <span
        aria-hidden="true"
        className="absolute right-[-8%] bottom-[-12%] size-[68%] rotate-12 bg-canvas/75 [clip-path:polygon(50%_0,100%_100%,0_100%)]"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export type ArtworkFrameProps = Omit<ComponentProps<'div'>, 'children'> & {
  alt: string
  children?: ReactNode | undefined
  loading?: 'eager' | 'lazy' | undefined
  ratio?: ArtworkRatio | undefined
  src?: string | undefined
}

export function ArtworkFrame({
  alt,
  children,
  className,
  loading = 'lazy',
  ratio = 'portrait',
  src,
  ...props
}: ArtworkFrameProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-border bg-surface',
        ratioClasses[ratio],
        className,
      )}
      data-consumit-artwork-frame
      {...props}
    >
      {src ? (
        <img
          alt={alt}
          className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
          loading={loading}
          src={src}
        />
      ) : (
        <MissingArtwork label={alt || 'Artwork unavailable'} />
      )}
      {children}
    </div>
  )
}

export type PosterCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  alt?: string | undefined
  badge?: ReactNode | undefined
  footer?: ReactNode | undefined
  href?: string | undefined
  meta?: ReactNode | undefined
  src?: string | undefined
  title: string
}

export function PosterCard({
  alt,
  badge,
  className,
  footer,
  href,
  meta,
  src,
  title,
  ...props
}: PosterCardProps) {
  const titleText = (
    <span className="font-bold text-ink transition-colors group-hover:text-orange motion-reduce:transition-none">
      {title}
    </span>
  )

  return (
    <article
      className={cn('group min-w-0', className)}
      data-consumit-poster-card
      {...props}
    >
      <ArtworkFrame alt={alt ?? `${title} poster`} src={src}>
        {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
      </ArtworkFrame>
      <div className="mt-3 min-w-0">
        {href ? (
          <a
            className="rounded-micro outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            href={href}
          >
            {titleText}
          </a>
        ) : (
          titleText
        )}
        {meta ? <div className="mt-1 text-xs text-muted">{meta}</div> : null}
        {footer ? <div className="mt-2">{footer}</div> : null}
      </div>
    </article>
  )
}

export type LandscapeStillProps = Omit<ComponentProps<'div'>, 'children'> & {
  alt: string
  playHref?: string | undefined
  playLabel?: string | undefined
  progress?: number | undefined
  src?: string | undefined
}

export function LandscapeStill({
  alt,
  className,
  playHref,
  playLabel = 'Continue watching',
  progress,
  src,
  ...props
}: LandscapeStillProps) {
  const safeProgress =
    progress === undefined ? undefined : Math.min(Math.max(progress, 0), 100)

  return (
    <div
      className={cn('group relative', className)}
      data-consumit-landscape-still
      {...props}
    >
      <ArtworkFrame alt={alt} ratio="landscape" src={src}>
        {playHref ? (
          <a
            aria-label={playLabel}
            className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink/35 bg-canvas/80 text-ink outline-none transition-[background-color,transform] hover:scale-105 hover:bg-canvas focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            href={playHref}
          >
            <Play aria-hidden="true" className="size-5 fill-current" />
          </a>
        ) : null}
      </ArtworkFrame>
      {safeProgress === undefined ? null : (
        <div
          aria-label={`${safeProgress}% watched`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={safeProgress}
          className="absolute inset-x-0 bottom-0 h-1 bg-surface-raised"
          role="progressbar"
        >
          <span
            className="block h-full bg-orange"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function PosterMatchBadge({ score }: { score: number }) {
  return <Badge tone="orange">{Math.round(score)}% match</Badge>
}
