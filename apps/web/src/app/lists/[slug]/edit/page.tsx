import { notFound } from 'next/navigation'
import { tasteListReadSchema } from '@consumit/contracts'
import { getListRead, memberRequest } from '@/lib/member-server'
import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { CollectionEditor } from '../../../taste/list-publication'
export default async function EditCollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preset?: string }> }) {
  const data = await getListRead((await params).slug)
  if (!('viewerCanEdit' in data) || !data.viewerCanEdit || !('origin' in data.list)) notFound()
  const layout = await memberRequest(`/v1/taste/lists/${data.list.id}`, tasteListReadSchema)
  const titles = (await getCatalogBatchForRefs(data.items))?.items ?? []
  return <CollectionEditor key={data.list.id} data={data as import('@consumit/contracts').MemberListDetail} titles={titles} initialLayout={layout.layout} revision={layout.revision} preset={(await searchParams).preset} />
}
