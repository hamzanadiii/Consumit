import { notFound } from 'next/navigation'
import { tasteReviewSchema } from '@consumit/contracts'
import { memberRequest, MemberApiError } from '@/lib/member-server'
import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { ReviewPublication } from '../../taste/review-publication'
export const metadata = { title: 'Review · Consumit', robots: { index: false, follow: false } }
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  let review
  try { review = await memberRequest(`/v1/taste/reviews/${encodeURIComponent((await params).id)}`, tasteReviewSchema) } catch (e) { if (e instanceof MemberApiError && e.status === 404) notFound(); throw e }
  const title = (await getCatalogBatchForRefs([review]).catch(() => null))?.items[0]
  return <ReviewPublication review={review} title={title} />
}
