import type { ComponentProps, ElementType, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { ArtworkImage } from './artwork-image'
import { MissingArtwork } from './missing-artwork'

export { MissingArtwork }
export type { MissingArtworkProps } from './missing-artwork'

const ratioClasses = {
  landscape: 'aspect-video',
  portrait: 'aspect-[2/3]',
  square: 'aspect-square',
  wide: 'aspect-[2.15/1]',
} as const

export type ArtworkRatio = keyof typeof ratioClasses

export type ArtworkFrameProps = Omit<ComponentProps<'div'>, 'children'> & {
  alt: string
  children?: ReactNode | undefined
  loading?: 'eager' | 'lazy' | undefined
  ratio?: ArtworkRatio | undefined
  src?: string | undefined
  fallbackSrc?: string | undefined
}

export function ArtworkFrame({
  alt,
  children,
  className,
  loading = 'lazy',
  ratio = 'portrait',
  src,
  fallbackSrc,
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
        <ArtworkImage alt={alt} className="size-full object-cover" fallbackSrc={fallbackSrc} key={`${src}\u0000${fallbackSrc ?? ''}`} loading={loading} src={src} />
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
