import type { ComponentProps, ElementType, ReactNode } from 'react'

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
          className="size-full object-cover"
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

export type PosterStackProps = Omit<ComponentProps<'div'>, 'children'> & {
  items: readonly { key: string; label: string; src?: string | undefined; href?: string | undefined }[]
  linkComponent?: ElementType | undefined
}

/** A compact collection preview. The first cover leads; every linked cover stays keyboard reachable. */
export function PosterStack({ items, className, linkComponent: LinkComponent = 'a', ...props }: PosterStackProps) {
  return (
    <div className={cn('relative aspect-[12/5] min-w-0', className)} data-consumit-poster-stack {...props}>
      {items.slice(0, 5).map((item, index) => {
        const style = { left: `${index * (100 - 250 / 9) / 4}%`, width: `${250 / 9}%`, zIndex: 5 - index }
        const artwork = <ArtworkFrame alt={item.href ? '' : item.label} className="h-full w-full" src={item.src} />
        return item.href ? (
          <LinkComponent aria-label={item.label} className="consumit-poster-stack-cover absolute inset-y-0 block rounded-card outline-none" href={item.href} key={item.key} style={style} title={item.label}>
            {artwork}
          </LinkComponent>
        ) : <div className="consumit-poster-stack-cover absolute inset-y-0" key={item.key} style={style}>{artwork}</div>
      })}
      {items.length === 0 ? <ArtworkFrame alt="Collection artwork unavailable" className="absolute inset-y-0 w-[27.7778%]" /> : null}
    </div>
  )
}
