/** Capture time outside React render so a server-rendered airing decision is
 * stable for the matching client hydration. */
export function serverRenderTime(): number {
  return Date.now()
}
