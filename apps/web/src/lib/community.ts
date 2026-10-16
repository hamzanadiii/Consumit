function destination(value: string | undefined, fallback: string): string | null {
  try { const url = new URL(value ?? fallback); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null } catch { return null }
}
export const communityLinks = [
  { name: 'Discord', href: destination(process.env.NEXT_PUBLIC_CONSUMIT_DISCORD_URL, 'https://discord.gg/p7XVyk6vs'), description: 'Talk about what you’re watching and help shape Consumit.' },
  { name: 'Reddit', href: destination(process.env.NEXT_PUBLIC_CONSUMIT_REDDIT_URL, 'https://www.reddit.com/r/Consumit/'), description: 'Share discoveries, suggestions, and feedback with the community.' },
]
