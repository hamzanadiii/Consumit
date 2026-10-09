'use client'

import { useState } from 'react'

import { getInitials } from './initials'

type AvatarImageProps = {
  alt: string
  name: string
  src: string | undefined
}

/**
 * Client-only leaf: swaps a broken portrait for initials without dragging
 * React state into the server-safe identity module.
 */
export function AvatarImage({ alt, name, src }: AvatarImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) return <span aria-hidden="true">{getInitials(name) || 'C'}</span>
  return (
    <img
      alt={alt}
      className="size-full rounded-full object-cover"
      onError={() => setFailed(true)}
      src={src}
    />
  )
}
