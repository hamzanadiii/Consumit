import { getImageProps } from 'next/image'

/** Video posters inherit the media element's CORS mode. Cache artwork on
 * the app origin so image CDNs need not grant media-style CORS access. */
export function watchPoster(src: string | null | undefined): string | undefined {
  if (!src) return undefined
  return getImageProps({ src, alt: '', width: 600, height: 338 }).props.src
}
