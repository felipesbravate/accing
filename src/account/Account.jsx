'use client';
// Profile and Settings (Figma "Main screens" 226:2154): Profile (268:11591), Wardrobe (306:4775, Remove 312:5607),
// Settings (270:1948), Hidden looks (297:2778, Unhide 313:6057, restored 322:6192), Update password (287:3529), Update
// email (287:3642) and Verify (287:3723, with the emailed link), Delete account (287:3811), and Reset password (no frame: the Update password
// layout without the current password). Face photos live in Faces.jsx.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { slideBack, useSlideIn } from '../ui/slide.js';
import { useRouter } from 'next/navigation';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from '../ui/Logo.jsx';
import { PhotoViewer } from '../ui/PhotoViewer.jsx';
import { InfoBox, Modal, TextField, Tile, TopNav } from '../ui/kit.jsx';
import { PASSWORD_RULE } from '../lib/login-form.js';
import { FACE_UPDATE } from '../lib/features.js';
import { fileToJpeg } from '../onboarding/resize.js';
import '../ui/components.css';
import './account.css';
import '../login/login.css';

export async function api(body) {
  const res = await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return res ? res.json().catch(() => ({ error: 'Something went wrong' })) : { error: 'No connection. Try again.' };
}
export async function apiUpload(fields, blob) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('photo', blob, 'photo.jpg');
  const res = await fetch('/api/account', { method: 'POST', body: form }).catch(() => null);
  return res ? res.json().catch(() => ({ error: 'Something went wrong' })) : { error: 'No connection. Try again.' };
}

/** A screen with the top-nav (back + title) and a scrolling body. */
export function Screen({ title, back = '/', right = null, children, footer = null, className = '' }) {
  const router = useRouter();
  const el = useRef(null);
  useSlideIn(el);
  const onBack = () => slideBack(el.current, () => (window.history.length > 1 ? router.back() : router.push(back)));
  return (
    <div ref={el} className={('acc-screen ' + className).trim()}>
      <TopNav title={title} onBack={onBack} right={right} className="acc-nav" />
      <main className="acc-body">{children}</main>
      {footer && <div className="acc-footer">{footer}</div>}
    </div>
  );
}

function Problem({ text }) {
  return text ? <p className="acc-problem" role="alert">{text}</p> : null;
}

/** A square crop of a picked photo, as a JPEG, for the avatar. */
async function squareJpeg(file, side = 512) {
  const big = await fileToJpeg(file);
  const img = await createImageBitmap(big);
  const s = Math.min(img.width, img.height);
  const c = document.createElement('canvas'); c.width = side; c.height = side;
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
  return new Promise((done) => c.toBlob(done, 'image/jpeg', 0.9));
}

// ── Profile ──
export function Profile({ data }) {
  const [avatar, setAvatar] = useState(data.avatar);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState(null);
  const pick = useRef(null);
  const onPhoto = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setProblem(null);
    const r = await apiUpload({ kind: 'avatar' }, await squareJpeg(f));
    setBusy(false);
    if (r.error) setProblem(r.error); else setAvatar(r.avatar);
  };
  const initial = (data.name || data.email || '?').charAt(0).toUpperCase();
  return (
    <Screen title="Profile" right={<Link className="ds-icon-button is-large is-secondary" href="/settings" prefetch aria-label="Settings"><Icon name="settings" size={24} /></Link>}>
      <section className="acc-profile">
        <div className="acc-photo">
          <span className="ds-avatar acc-avatar" aria-busy={busy}>{avatar ? <img src={avatar} alt="" /> : initial}</span>
          <button type="button" className="ds-icon-button is-tiny acc-photo-edit" onClick={() => pick.current?.click()} disabled={busy} aria-label="Change profile photo">
            <Icon name="edit-2" size={12} strokeWidth={2.5} />
          </button>
          <input ref={pick} className="visually-hidden" type="file" accept="image/*" tabIndex={-1} onChange={onPhoto} />
        </div>
        <div className="acc-who">
          <h1>{data.name || 'Your profile'}</h1>
          <p>{data.email}</p>
        </div>
        <Problem text={problem} />
      </section>
      <ul className="acc-stats">
        {data.stats.map((s) => (
          <li key={s.label}><span className="acc-stat-count">{s.count}</span>
            <span className="acc-stat-label">{s.heart && <Icon name="heart" size={12} strokeWidth={2.5} className="acc-stat-heart" />}{s.label}</span></li>
        ))}
      </ul>
      <h2 className="acc-section-tab">Wardrobe</h2>
      <div className="acc-tiles">
        {data.tiles.map((t) => <Tile key={t.key} icon={t.icon} label={t.label} sub={`${t.count} item${t.count === 1 ? '' : 's'}`} href={`/wardrobe/${t.key}`} />)}
      </div>
      <form method="post" action="/auth/signout" className="acc-logout">
        <button type="submit" className="ds-button is-large is-secondary is-danger"><Icon name="log-out" size={20} strokeWidth={5 / 3} />Log out</button>
      </form>
    </Screen>
  );
}

// Empty Wardrobe tile / no hidden looks (Figma 401:2929, 401:2995).
function Empty({ title, text }) {
  return <div className="acc-empty"><h2>{title}</h2><p>{text}</p></div>;
}

// ── Wardrobe ──
export function Wardrobe({ data }) {
  const [items, setItems] = useState(data.items);
  const [asking, setAsking] = useState(null), [busy, setBusy] = useState(false), [problem, setProblem] = useState(null);
  const c = data.category;
  const [open, setOpen] = useState(null); // the garment shown full screen
  const remove = async () => {
    setBusy(true); setProblem(null);
    const r = await api({ action: 'remove-garment', key: asking.key });
    setBusy(false);
    if (r.error) { setProblem(r.error); return; }
    setItems((l) => l.filter((x) => x.key !== asking.key)); setAsking(null);
  };
  return (
    <Screen title="Wardrobe" back="/profile">
      <header className="acc-cat-head">
        <span className="acc-cat-icon"><Icon name={c.icon} size={20} /></span>
        <div><h1>{c.label}</h1><p>{items.length} item{items.length === 1 ? '' : 's'}</p></div>
      </header>
      <Problem text={problem} />
      {items.length ? (
        <ul className="acc-grid">
          {items.map((g) => (
            <li key={g.key} className="acc-card">
              {g.image ? (
                // Tap to see the whole photo, zoomed onto the garment (PhotoViewer).
                <button type="button" className={'acc-card-img is-button' + (g.isLook ? ' is-look' : '')} onClick={() => setOpen(g)} aria-label={`See ${g.description} bigger`}>
                  <img src={g.image} alt={g.description} style={{ objectPosition: g.position, '--origin': g.position }} loading="lazy" />
                </button>
              ) : <div className="acc-card-img"><Icon name={c.icon} size={32} /></div>}
              <button type="button" className="ds-button is-tiny is-secondary acc-card-action" onClick={() => setAsking(g)}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <Empty title="Nothing here yet" text="Garments appear once a look has been made with them." />}
      <Modal open={Boolean(asking)} title={`Remove this ${c.one}?`} description="This permanently removes the item and all its looks, including favorites." onClose={() => !busy && setAsking(null)}>
          <button type="button" className="ds-button is-large is-tertiary" onClick={() => setAsking(null)} disabled={busy}>Cancel</button>
          <button type="button" className="ds-button is-large" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button>
        </Modal>
      {open && <PhotoViewer src={open.image} alt={open.description} caption={open.description} focus={open.isLook ? null : open.position} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

// ── Settings ──
function Entry({ href, icon, title, text, danger = false }) {
  return (
    <Link className={'acc-entry' + (danger ? ' is-danger' : '')} href={href} prefetch>
      <span className="acc-entry-icon"><Icon name={icon} size={20} strokeWidth={5 / 3} /></span>
      <span className="acc-entry-text"><span className="acc-entry-title">{title}</span>{text && <span className="acc-entry-sub">{text}</span>}</span>
      <Icon name="chevron-right" size={16} className="acc-entry-chevron" />
    </Link>
  );
}
export function Settings({ data }) {
  return (
    <Screen title="Settings" back="/profile">
      <section className="acc-group">
        <h2>Your style</h2>
        <div className="acc-entries">
          {FACE_UPDATE && <Entry href="/settings/face" icon="camera" title="Update face photos" text="Change the photos used to generate your outfit previews." />}
          <Entry href="/settings/hidden" icon="eye-off" title="Hidden looks" text="View and manage looks you’ve hidden." />
        </div>
      </section>
      <section className="acc-group">
        <h2>Account &amp; security</h2>
        <div className="acc-entries">
          <Entry href="/settings/password" icon="lock" title="Update your login password" text={data.passwordNote} />
          <Entry href="/settings/email" icon="mail" title="Update your email" />
        </div>
      </section>
      <section className="acc-group">
        <h2>Account</h2>
        <div className="acc-entries">
          <Entry href="/settings/delete" icon="user-x" title="Delete account" text="Permanently delete your account and all its data. This cannot be undone." danger />
        </div>
      </section>
    </Screen>
  );
}

// ── Hidden looks ──
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export function HiddenLooks({ looks: initial }) {
  const [looks, setLooks] = useState(initial);
  const [asking, setAsking] = useState(null), [toast, setToast] = useState(null), [problem, setProblem] = useState(null);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  const mark = async (id, action) => {
    const res = await fetch('/api/looks/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) }).catch(() => null);
    return res?.ok;
  };
  const unhide = async () => {
    const look = asking; setAsking(null); setProblem(null);
    if (!(await mark(look.id, 'unhide'))) { setProblem('Couldn’t restore that look. Try again.'); return; }
    setLooks((l) => l.filter((x) => x.id !== look.id));
    setToast({ look });
  };
  const undo = async () => {
    const { look } = toast; setToast(null);
    if (await mark(look.id, 'hide')) setLooks((l) => [look, ...l]);
  };
  return (
    <Screen title="Hidden looks" back="/settings" className="has-fade">
      <div className="acc-intro">
        <h1>Review your hidden looks</h1>
        <p>Unhide a look to restore it to your outfit gallery and daily suggestions.</p>
      </div>
      <Problem text={problem} />
      {looks.length ? (
        <ul className="acc-grid">
          {looks.map((l) => (
            <li key={l.id} className="acc-card is-look">
              <div className="acc-card-img"><img src={l.image} alt={l.alt} loading="lazy" /></div>
              <p className="acc-card-note">Hidden on {fmtDay(l.hiddenAt)}</p>
              <button type="button" className="ds-button is-secondary acc-card-action" onClick={() => setAsking(l)}>Unhide</button>
            </li>
          ))}
        </ul>
      ) : <Empty title="No hidden looks" text="Looks you hide from the mirror show up here." />}
      <Modal open={Boolean(asking)} title="Unhide this look?" description="This will restore the look to your outfit gallery and daily suggestions." onClose={() => setAsking(null)}>
          <button type="button" className="ds-button is-large is-tertiary" onClick={() => setAsking(null)}>Cancel</button>
          <button type="button" className="ds-button is-large" onClick={unhide}>Unhide</button>
        </Modal>
      {toast && (
        <div className="acc-toast">
          <div className="ds-toast" role="status">
            <div className="ds-toast-content"><div className="ds-toast-main">
              <span className="ds-toast-message">Look restored to your gallery.</span>
              <button type="button" className="ds-toast-action" onClick={undo}>Undo</button>
            </div></div>
          </div>
        </div>
      )}
    </Screen>
  );
}

// ── Update password / Reset password ──
export function Password({ reset = false }) {
  const router = useRouter();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false), [err, setErr] = useState(null), [done, setDone] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await api({ action: 'password', ...f });
    setBusy(false);
    if (r.error) setErr(r); else setDone(true);
  };
  const ready = (reset || f.current) && f.next && f.confirm;
  const leave = () => router.push(reset ? '/' : '/settings');
  const fields = (
    <>
      <div className="acc-fields">
        {!reset && <TextField label="Current password" type="password" autoComplete="current-password" placeholder="Enter your current password" value={f.current} onChange={set('current')}
          invalid={err?.field === 'current'} support={err?.field === 'current' ? err.error : null} />}
        <TextField label="New password" type="password" autoComplete="new-password" placeholder="Enter your new password" value={f.next} onChange={set('next')}
          invalid={err?.field === 'next'} support={err?.field === 'next' ? err.error : null} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" placeholder="Re-enter your new password" value={f.confirm} onChange={set('confirm')}
          invalid={err?.field === 'confirm'} support={err?.field === 'confirm' ? err.error : null} />
      </div>
      <InfoBox title="Password requirements">{PASSWORD_RULE}</InfoBox>
      {err && !err.field && <Problem text={err.error} />}
    </>
  );
  const submitButton = <button type="submit" form="acc-password" className="ds-button is-large acc-wide" disabled={!ready || busy}>{busy ? 'Saving…' : 'Update password'}</button>;
  const doneModal = (
    <Modal open={Boolean(done)} title="Password updated" description="Use your new password the next time you sign in." onClose={leave}>
      <button type="button" className="ds-button is-large" onClick={leave}>Done</button>
    </Modal>
  );
  if (reset) {
    // From the "Forgot your password?" email (Figma 402:4085): the sign-in layout, no top-nav.
    return (
      <main className="login-page">
        <header className="login-brand"><Logo className="login-logo" /><p className="login-tagline">Unapologetically you.</p></header>
        <section className="login-content">
          <div className="login-intro"><h1 className="login-title">Choose a new password</h1><p>Keep your account secure with a password you don’t use elsewhere.</p></div>
          <form id="acc-password" className="login-form" onSubmit={submit}>{fields}{submitButton}</form>
        </section>
        {doneModal}
      </main>
    );
  }
  return (
    <Screen title="Update password" back="/settings" footer={submitButton}>
      <form id="acc-password" className="acc-form" onSubmit={submit}>
        <div className="acc-intro">
          <h1>Choose a new password</h1>
          <p>Keep your account secure with a password you don’t use elsewhere.</p>
        </div>
        {fields}
      </form>
      {doneModal}
    </Screen>
  );
}

// ── Update email → Verify ──
const RESEND_SECONDS = 30;
export function Email({ current, verified = false }) {
  const router = useRouter();
  const [step, setStep] = useState('email');
  const [justVerified, setJustVerified] = useState(verified);
  const [f, setF] = useState({ newEmail: '', password: '' });
  const [busy, setBusy] = useState(false), [err, setErr] = useState(null), [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const send = async (e) => {
    e?.preventDefault(); setBusy(true); setErr(null);
    const r = await api({ action: 'email', ...f });
    setBusy(false);
    if (r.error) { setErr(r); return; }
    setStep('verify'); setWait(RESEND_SECONDS);
  };
  const resend = async () => { setErr(null); const r = await api({ action: 'resend-email', newEmail: f.newEmail }); if (r.error) setErr(r); else setWait(RESEND_SECONDS); };
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (step === 'verify') {
    // Supabase's default email has a confirmation link, not a code (a code needs custom SMTP to edit the template):
    // Figma 287:3723's layout with the link instead of the six boxes.
    return (
      <Screen title="Verify your new email" back="/settings"
        footer={<>
          <button type="button" className="ds-button is-large acc-wide" onClick={() => router.push('/settings')}>Done</button>
          <button type="button" className="ds-button is-large is-tertiary acc-wide" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Resend email (${fmt(wait)})` : 'Resend email'}</button>
        </>}>
        <div className="acc-form">
          <div className="acc-intro">
            <h1>Check your email</h1>
            <p>Open the link we sent to your new email address to confirm the change.</p>
          </div>
          <div className="acc-email-row"><span>{f.newEmail}</span><button type="button" className="acc-action-link" onClick={() => { setStep('email'); setErr(null); }}>Change email</button></div>
          <InfoBox title="Verify before we update">Your account email only changes after you open the link. Until then, sign in with {current}.</InfoBox>
          {err && <Problem text={err.error} />}
        </div>
      </Screen>
    );
  }
  return (
    <Screen title="Update email" back="/settings"
      footer={<button type="submit" form="acc-email" className="ds-button is-large acc-wide" disabled={!f.newEmail || !f.password || busy}>{busy ? 'Sending…' : 'Send verification link'}</button>}>
      <form id="acc-email" className="acc-form" onSubmit={send}>
        <div className="acc-intro">
          <h1>Your new email</h1>
          <p>Enter the email address you’d like to use to sign in. We’ll send a verification link to this new address.</p>
        </div>
        <div className="acc-fields">
          <TextField label="New email address" type="email" inputMode="email" autoComplete="email" placeholder="Enter new email address" value={f.newEmail}
            onChange={(e) => setF((x) => ({ ...x, newEmail: e.target.value }))} invalid={err?.field === 'email'} support={err?.field === 'email' ? err.error : `Now: ${current}`} />
          <TextField label="Current password" type="password" autoComplete="current-password" placeholder="Enter your current password" value={f.password}
            onChange={(e) => setF((x) => ({ ...x, password: e.target.value }))} invalid={err?.field === 'password'} support={err?.field === 'password' ? err.error : null} />
        </div>
        <InfoBox title="Verify before we update">Your account email only changes after you verify the new address.</InfoBox>
        {err && !err.field && <Problem text={err.error} />}
      </form>
      {/* After the link in the email (app/settings/email/done → ?verified=1), Figma 402:3974. */}
      <Modal open={justVerified} title="Email verified" description="Use your new email the next time you sign in." onClose={() => { setJustVerified(false); router.push('/settings'); }}>
        <button type="button" className="ds-button is-large" onClick={() => { setJustVerified(false); router.push('/settings'); }}>Done</button>
      </Modal>
    </Screen>
  );
}

// ── Delete account ──
export function DeleteAccount() {
  const router = useRouter();
  const [typed, setTyped] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await api({ action: 'delete', confirm: typed });
    setBusy(false);
    if (r.error) setErr(r.error); else window.location.replace('/login');
  };
  return (
    <Screen title="Delete account" back="/settings"
      footer={<>
        <button type="button" className="ds-button is-large is-secondary acc-wide" onClick={() => router.push('/settings')}>Keep my account</button>
        <button type="submit" form="acc-delete" className="ds-button is-large is-danger acc-wide" disabled={typed.trim() !== 'DELETE' || busy}>{busy ? 'Deleting…' : 'Delete account'}</button>
      </>}>
      <form id="acc-delete" className="acc-form" onSubmit={submit}>
        <div className="acc-intro"><h1>Before you go</h1></div>
        <InfoBox type="danger" icon="alert-triangle" title="This action cannot be undone">Your account and all its data will be permanently deleted. You won’t be able to recover them.</InfoBox>
        <TextField label="Type DELETE to confirm" placeholder="Type here" autoComplete="off" autoCapitalize="characters" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <Problem text={err} />
      </form>
    </Screen>
  );
}
