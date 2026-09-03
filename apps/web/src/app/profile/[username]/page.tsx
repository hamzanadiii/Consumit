import { PublicProfileScreen } from '../public-profile-screen'

type PublicProfilePageProps = {
  params: Promise<{ username: string }>
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params

  return <PublicProfileScreen username={username} />
}
