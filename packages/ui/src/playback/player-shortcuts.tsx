/** Keep the help shared by Watch and the player beside the keyboard handler. */
export const PLAYER_SEEK_STEP = 10
export const PLAYER_SHORTCUTS = [
  ['Space / K', 'Play / pause'],
  ['J / L / ← / →', `Back / forward ${PLAYER_SEEK_STEP}s`],
  ['↑ / ↓', 'Volume'],
  ['F', 'Fullscreen'],
  ['M', 'Mute'],
  ['C', 'Subtitles'],
  ['Home / End', 'Start / end'],
] as const

export function PlayerShortcuts() {
  return <dl className="space-y-3 p-4 text-sm">
    {PLAYER_SHORTCUTS.map(([keys, action]) => <div className="flex flex-wrap justify-between gap-2" key={keys}><dt className="font-medium text-ink">{keys}</dt><dd className="text-copy">{action}</dd></div>)}
  </dl>
}
