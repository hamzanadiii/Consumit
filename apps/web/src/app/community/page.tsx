import { redirect } from 'next/navigation'
import { tasteCommunitySchema, type TasteCommunity } from '@consumit/contracts'
import { memberRequest } from '@/lib/member-server'
import { getServerSession } from '@/lib/identity-server'
import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { CommunityScreen } from '../taste/community'
export const metadata = { title: 'Community · Consumit' }
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ mode?: string; q?: string; kind?: string; genre?: string; cursor?: string }> }) {
  const p = await searchParams, mode = p.mode === 'following' ? 'following' : 'discover', query = (p.q ?? '').slice(0, 100), kind = ['movie', 'series', 'anime'].includes(p.kind ?? '') ? p.kind! : 'all'
  if (mode === 'following' && (await getServerSession()).status !== 'authenticated') redirect('/sign-in?next=%2Fcommunity%3Fmode%3Dfollowing')
  let data: TasteCommunity | null = null
  let initialError = false
  try {
    data = await memberRequest(`/v1/taste/community?${new URLSearchParams({ mode, q: query, kind, genre: p.genre ?? '', ...(p.cursor ? { cursor: p.cursor } : {}) })}`, tasteCommunitySchema)
  } catch {
    initialError = true
  }
  const titles = (await getCatalogBatchForRefs((data?.items ?? []).flatMap(item => item.refs)).catch(() => null))?.items ?? []
  const genre = p.genre ?? ''
  const cursor = p.cursor ?? ''
  return <CommunityScreen key={`${mode}:${query}:${kind}:${genre}:${cursor}`} data={data} titles={titles} mode={mode} query={query} kind={kind} genre={genre} cursor={cursor} initialError={initialError} />
}
