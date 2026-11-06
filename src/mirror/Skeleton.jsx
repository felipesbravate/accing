// Skeletons (2026-11-06): what shows while looks load, shaped like what will be there, so the screen doesn't jump.
// RingSkeleton: three vertical blocks in place of the ring (a filter's looks loading). MirrorSkeleton: the whole
// mirror (header, date, menu, ring, buttons) while the app's first data arrives (app/(home)/loading.jsx).
// No hooks: it renders on the server. Not class "mirror": the splash waits for the real mirror (Splash.jsx READY).
import { Logo } from '../ui/Logo.jsx';

export function RingSkeleton() {
  return (
    <div className="ring-skeleton" role="status" aria-label="Loading looks">
      <span><i className="look-skeleton" /></span>
      <span><i className="look-skeleton" /></span>
      <span><i className="look-skeleton" /></span>
    </div>
  );
}

export function MirrorSkeleton() {
  return (
    <div className="mirror-skel" aria-busy="true">
      <header className="mirror-header">
        <Logo className="mirror-logo" />
        <span className="skel-actions-top"><i className="skel-bar is-button" /><i className="skel-bar is-avatar" /></span>
      </header>
      <main className="mirror-content">
        <div className="skel-top">
          <i className="skel-bar is-question" />
          <i className="skel-bar is-meta" />
        </div>
        <div className="skel-menu">{[96, 64, 88, 64, 52].map((w, i) => <i key={i} className="skel-bar" style={{ width: w }} />)}</div>
        <section className="mirror-body">
          <div className="mirror-carousel"><RingSkeleton /></div>
          <div className="skel-look-bar">
            <span>{[0, 1, 2].map((i) => <i key={i} className="skel-bar is-icon" />)}</span>
            <span className="skel-dots">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={'skel-bar is-dot' + (i === 0 ? ' is-active' : '')} />)}</span>
          </div>
        </section>
      </main>
      <div className="skel-bottom"><i className="skel-bar is-button" /><i className="skel-bar is-avatar" /></div>
    </div>
  );
}
