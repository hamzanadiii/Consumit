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

/** A member-chosen portrait when set, otherwise the generated tile seed. */
export function memberAvatarSrc(avatarUrl: string | null | undefined, fallbackSeed: string): string {
  return avatarUrl ?? dicebearAvatarUrl(fallbackSeed)
}
