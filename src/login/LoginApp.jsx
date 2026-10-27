'use client';
// Sign in and create account. Plain forms (they work before this script loads); the script only shows a busy state.
import { useEffect, useRef, useState } from 'react';
import './login.css';

function useBusy() {
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  useEffect(() => {
    const reset = () => { sent.current = false; setBusy(false); };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  const onSubmit = (event) => {
    if (sent.current) { event.preventDefault(); return; }
    sent.current = true; setBusy(true);
  };
  return [busy, onSubmit];
}

export default function LoginApp({ mode = 'signin', message = null, preview = false }) {
  const [busy, onSubmit] = useBusy();
  const signup = mode === 'signup';
  return (
    <main className="login-page">
      <header className="login-header">
        <p className="login-logo">Accing</p>
        <p className="login-tagline">What to wear today, on you.</p>
      </header>

      <section className="login-card" aria-busy={busy}>
        <h1 className="h2">{signup ? 'Create your account' : 'Sign in'}</h1>
        {message && <p className={'login-msg' + (message.ok ? ' is-ok' : '')} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}

        <form className="login-form" method="post" action={signup ? '/auth/signup' : '/auth/login'} onSubmit={onSubmit}>
          {signup && (
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" autoComplete="name" required maxLength={80} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} />
          </div>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}</button>
        </form>

        <p className="login-switch">
          {signup ? <>Already have an account? <a href="/login">Sign in</a></> : <>New to Accing? <a href="/login?mode=signup">Create an account</a></>}
        </p>

        {preview && (
          <form className="login-preview" method="post" action="/auth/preview" onSubmit={onSubmit}>
            <p className="caption">Supabase isn't connected yet. You can still look around.</p>
            <button className="btn is-ghost" type="submit" disabled={busy}>Continue with preview account</button>
          </form>
        )}
      </section>
    </main>
  );
}
