import { FilScreenShell } from './home/filscreen-shell'
import { FilScreenLoading } from './home/filscreen-loading'

export default function Loading() {
  return (
    <FilScreenShell activeKindTab="new" pageHeading="Loading Consumit home">
      <FilScreenLoading />
    </FilScreenShell>
  )
}
