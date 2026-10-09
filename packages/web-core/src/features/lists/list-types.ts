export type ListCollectionItem = {
  description: string | null
  itemCount: number
  name: string
  posters: readonly (string | undefined)[]
  curator: string
  username: string
  slug: string
  visibility: 'private'
  savedByViewer: boolean
  isOwner: boolean
}
export type ListsCollectionProps = {
  catalogDetailsLimited?: boolean
  catalogUnavailable?: boolean
  listNextCursor?: string | null
  lists: readonly ListCollectionItem[]
}
