export { consumitIdForAnilist, mediaIdentityForAnime } from './media-identity.ts'

export function lookupTitlesFor(detail: { title: string; titles: { romaji: string | null; english: string | null; native: string | null } }): string[] {
  return [detail.titles.english, detail.titles.romaji, detail.titles.native, detail.title]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, all) => all.indexOf(value) === index)
}
