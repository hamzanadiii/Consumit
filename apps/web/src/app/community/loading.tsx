import { FilScreenShell } from '../shared'

export default function CommunityLoading() {
  return (
    <FilScreenShell>
      <main id="consumit-main-content" tabIndex={-1} aria-busy="true" className="taste taste-page taste-community-page taste-community-loading">
        <p className="sr-only" role="status">Loading Community</p>
        <div className="taste-community-loading-heading"><span /><span /><span /></div>
        <div className="taste-community-loading-tabs"><span /><span /><span /></div>
        <div className="taste-community-loading-toolbar"><span /><span /><span /><span /></div>
        <div className="taste-community-grid" aria-hidden="true">
          {[0, 1, 2].map((item) => <div className="taste-community-loading-card" key={item}><span /><span /><span /><span /></div>)}
        </div>
      </main>
    </FilScreenShell>
  )
}
