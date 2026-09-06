import { LoadingState } from '@consumit/ui'

export default function Loading() {
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[62px]">
      <LoadingState rows={5} title="Loading the catalog" />
    </main>
  )
}
