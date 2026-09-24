import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../lib/cn'

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
