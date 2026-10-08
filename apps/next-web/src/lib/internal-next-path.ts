export function internalNextPath(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return '/'
  // Compare after URL normalization: browsers treat backslashes as slashes
  // and remove tabs/newlines, so a raw leading-slash check is insufficient.
  const origin = 'https://consumit.invalid'
  try {
    const destination = new URL(candidate, origin)
    if (destination.origin !== origin || destination.pathname.startsWith('//')) return '/'
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return '/'
  }
}
