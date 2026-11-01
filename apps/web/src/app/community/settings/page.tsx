import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/identity-server'
import { CommunitySettings } from '../../taste/community'
export default async function SettingsPage() { if ((await getServerSession()).status !== 'authenticated') redirect('/sign-in?next=%2Fcommunity%2Fsettings'); return <CommunitySettings /> }
