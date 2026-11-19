import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/identity-server'
import { NewCollection } from '../../taste/list-publication'
export default async function NewListPage() {
  if ((await getServerSession()).status !== 'authenticated') redirect('/sign-in?next=%2Flists%2Fnew')
  return <NewCollection />
}
