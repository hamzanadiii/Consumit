const DICEBEAR_BASE_URL = 'https://api.dicebear.com/7.x/notionists/svg'

/**
 * Notionists portrait address for a seed. The backdrop stays transparent so
 * the member's tile treatment shows through behind the character. Seeds are
 * random identifiers or public usernames only: never emails or anything else
 * that identifies a member to the third party serving the image.
 */
export function dicebearAvatarUrl(seed: string): string {
  return `${DICEBEAR_BASE_URL}?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`
}

export function randomAvatarSeed(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

/** One portrait across session and profile projections. Callers pass the
 * public identity so a private member id cannot become a different seed. */
export function memberAvatarSrc(member: { avatarUrl?: string | null | undefined; username: string }): string {
  return member.avatarUrl ?? dicebearAvatarUrl(member.username)
}
