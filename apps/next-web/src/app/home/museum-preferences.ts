/** Appearance is device-local. It never changes member records or playback preferences. */
export const ATMOSPHERE_KEY = 'consumit.next.atmosphere'
export const PROFILE_LAYOUT_KEY = 'consumit.next.profile-layout'
export const QUIET_MOTION_KEY = 'consumit.next.quiet-motion'

export const ATMOSPHERES = [
  { value: 'cinema', label: 'Cinema', description: 'Midnight, ivory, a little orange.' },
  { value: 'gallery', label: 'Paper gallery', description: 'Warm paper and room to breathe.' },
  { value: 'dusk', label: 'Dusk', description: 'A softer room for late nights.' },
] as const

export type Atmosphere = typeof ATMOSPHERES[number]['value']
export type ProfileLayout = 'gallery' | 'journal'

export function readMuseumPreferences() {
  try {
    const stored = window.localStorage.getItem(ATMOSPHERE_KEY)
    const light = window.localStorage.getItem('consumit.next.theme') === 'light'
    const atmosphere: Atmosphere = light ? 'gallery' : stored === 'dusk' ? 'dusk' : 'cinema'
    return {
      atmosphere,
      profileLayout: window.localStorage.getItem(PROFILE_LAYOUT_KEY) === 'journal' ? 'journal' as const : 'gallery' as const,
      quietMotion: window.localStorage.getItem(QUIET_MOTION_KEY) === 'true',
    }
  } catch {
    return { atmosphere: 'cinema' as const, profileLayout: 'gallery' as const, quietMotion: false }
  }
}

export function stampMuseumPreferences(atmosphere: Atmosphere, profileLayout: ProfileLayout, quietMotion: boolean) {
  document.documentElement.dataset.consumitAtmosphere = atmosphere
  document.documentElement.dataset.consumitProfileLayout = profileLayout
  document.documentElement.dataset.consumitQuietMotion = String(quietMotion)
}

export function storeMuseumPreference(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
