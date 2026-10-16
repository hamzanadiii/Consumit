// Fixed reviewed PROVE recipe, confined to this provider and media host.
// No caller-selected key, decoder or transformation is accepted.
const key = Uint8Array.from([86, 82, 132, 178, 234, 93, 156, 216, 222, 68, 110, 37, 115, 52, 99, 18, 159, 22, 49, 115, 77, 91, 187, 73, 74, 71, 15, 77, 48, 204, 58, 69], (byte, index) => byte ^ ((index * 37 + 11) & 255))
export function isBingeManifest(provider: string, url: string) {
  return provider === 'bingebangymovies' && new URL(url).hostname === 'os.bingebangstream.online'
}
export function bingeFetchUrl(provider: string, value: string, manifest: boolean) {
  const url = new URL(value)
  if (manifest && isBingeManifest(provider, value)) url.pathname = url.pathname.replace(/\.m3u8$/i, '.jpg')
  return url.href
}
export function decodeRelayManifest(bytes: Uint8Array, provider: string, url: string) {
  if (isBingeManifest(provider, url) && !(bytes[0] === 35 && bytes[1] === 69 && bytes[2] === 88)) {
    bytes = Uint8Array.from(bytes, (byte, index) => byte ^ key[index % key.length]!)
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
