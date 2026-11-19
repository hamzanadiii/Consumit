import { notFound, redirect } from 'next/navigation'
import { tasteEditionReadSchema, tasteEditionSchema } from '@consumit/contracts'
import { memberRequest, MemberApiError } from '@/lib/member-server'
import { getServerSession } from '@/lib/identity-server'
import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { loadTasteProfile } from '@/lib/taste-server'
import { EditionEditor, EditionReader } from '../../../../taste/editions'
export const metadata = { title: 'Monthly edition · Consumit', robots: { index: false, follow: false } }
export default async function EditionPage({ params, searchParams }: { params: Promise<{ username: string; month: string }>; searchParams: Promise<{ edit?: string }> }) {
  const route = await params, session = await getServerSession(), own = session.status === 'authenticated' && session.member.username === route.username
  const editing = route.month === 'new' || (await searchParams).edit === '1'
  if (editing && !own) redirect(`/sign-in?next=${encodeURIComponent(`/profile/${route.username}/editions/${route.month}?edit=1`)}`)
  const month = route.month === 'new' ? new Date().toISOString().slice(0, 7) : route.month
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound()
  let edition
  try { edition = await memberRequest(`/v1/taste/profiles/${route.username}/editions/${month}${editing ? '?draft=true' : ''}`, tasteEditionReadSchema) } catch (e) { if (!(e instanceof MemberApiError && e.status === 404)) throw e; if (!editing) notFound() }
  if (editing) {
    const loaded = await loadTasteProfile(route.username)
    if (!loaded.data.viewerIsOwner) notFound()
    const data = edition?.data ?? tasteEditionSchema.parse({ month, title: new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
    const extra = (await getCatalogBatchForRefs([...data.picks, ...(data.cover ? [data.cover] : [])]))?.items ?? []
    return <EditionEditor data={data} publishedAt={edition?.publishedAt ?? null} revision={edition?.revision ?? 0} profile={loaded.data} titles={[...loaded.titles, ...extra]} />
  }
  const titles = (await getCatalogBatchForRefs([...edition!.data.picks, ...(edition!.data.cover ? [edition!.data.cover] : [])]))?.items ?? []
  return <EditionReader edition={edition!} titles={titles} owner={own} />
}
