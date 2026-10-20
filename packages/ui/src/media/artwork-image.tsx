'use client'

import { useState } from 'react'

import { MissingArtwork } from './missing-artwork'

export function ArtworkImage({
  alt,
  className,
  fallbackSrc,
  loading,
  src,
}: {
  alt: string
  className?: string | undefined
  fallbackSrc?: string | undefined
  loading: 'eager' | 'lazy'
  src: string
}) {
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set())
  const imageSrc = [src, fallbackSrc].find((candidate) => candidate && !failedSources.has(candidate))

  return imageSrc ? (
    <img
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailedSources((failed) => new Set(failed).add(imageSrc))}
      src={imageSrc}
    />
  ) : <MissingArtwork label={alt || 'Artwork unavailable'} />
}
