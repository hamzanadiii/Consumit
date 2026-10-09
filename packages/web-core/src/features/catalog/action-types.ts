export type LogDialogExistingReview = {
  body: string
  reviewId: string
  reviewedOn: string | null
}

export type LogDialogProps = {
  existingReview?: LogDialogExistingReview | null | undefined
  id: number
  kind: 'movie' | 'series' | 'anime'
  onClose: () => void
  onSaved: () => void
  posterUrl?: string | undefined
  episode?: number | undefined
  season?: number | undefined
  title: string
  watchedOn?: string | undefined
  year?: number | null | undefined
}
