'use client';
// Sign in or create an account, email first. Figma 5evySGmkwmI2tXSjSSezwH: "Login - Create account" (177:2303, the
// email step), "Login" (186:3991, password for an existing account), "Create an account" (177:2816, new email).
// Plain forms (they work before this script loads); the script only shows a busy state and stops double submits.
import { useEffect, useRef, useState } from 'react';
import { Logo } from '../ui/Logo.jsx';
import { InfoBox, TextField } from '../ui/kit.jsx';
import { PASSWORD_RULE } from '../lib/login-form.js';
import '../ui/components.css';
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

/** text-field (Thread 122:683); password fields show what's typed with the eye. */
function Field({ id, ...rest }) {
  return <TextField name={id} {...rest} />;
}

function Message({ message }) {
  if (!message) return null;
  return <p className={'login-msg' + (message.ok ? ' is-ok' : '')} role={message.ok ? 'status' : 'alert'}>{message.text}</p>;
}

function OtherEmail({ onSubmit, busy, children = 'Use another email' }) {
  return (
    <form method="post" action="/auth/email" onSubmit={onSubmit}>
      <input type="hidden" name="reset" value="1" />
      <button type="submit" className="login-link" disabled={busy}>{children}</button>
    </form>
  );
}

function CreateForm({ email, onSubmit, busy }) {
  return (
    <form className="login-form" method="post" action="/auth/signup" onSubmit={onSubmit}>
      <div className="login-fields">
        <Field id="name" label="Full name" autoComplete="name" required maxLength={80} autoFocus placeholder="Your full name" />
        <Field id="email" label="Email address" type="email" autoComplete="email" inputMode="email" required defaultValue={email} placeholder="you@email.com" />
        <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters"
          pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}" title={PASSWORD_RULE} />
        <InfoBox title="Password requirements">{PASSWORD_RULE}</InfoBox>
      </div>
      <button className="ds-button is-large login-submit" type="submit" disabled={busy}>{busy ? 'One moment…' : 'Create account'}</button>
    </form>
  );
}

export default function LoginApp({ step = 'email', email = '', name = null, unsure = false, message = null, preview = false }) {
  const [busy, onSubmit] = useBusy();
  const initial = (name || email || '?').charAt(0).toUpperCase();
  return (
    <main className="login-page">
      <header className="login-brand">
        <Logo className="login-logo" />
        <p className="login-tagline">Unapologetically you.</p>
      </header>

      <section className="login-content" aria-busy={busy}>
        {step === 'reset-sent' && (
          <div className="login-intro" role="status">
            <h1 className="login-title">Check your email</h1>
            <p>Click the link in the email to reset your password.</p>
            <a className="login-link" href="/login">Back to sign in</a>
          </div>
        )}
        {step === 'email' && (
          <>
            <h1 className="login-title">Sign in or create an account</h1>
            <Message message={message} />
            <form className="login-form" method="post" action="/auth/email" onSubmit={onSubmit}>
              <Field id="email" label="Email address" type="email" autoComplete="email" inputMode="email" required placeholder="you@email.com" autoFocus />
              <button className="ds-button is-large login-submit" type="submit" disabled={busy}>{busy ? 'One moment…' : 'Continue'}</button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <div className="login-user">
              <span className="login-avatar" aria-hidden="true">{initial}</span>
              <div>
                <h1>{name ? `Hello, ${name}!` : 'Welcome back!'}</h1>
                <p>{email}</p>
              </div>
            </div>
            <Message message={message} />
            <form className="login-form" method="post" action="/auth/login" onSubmit={onSubmit}>
              <input className="visually-hidden" type="email" name="email" value={email} readOnly tabIndex={-1} aria-hidden="true" autoComplete="username" />
              <Field id="password" label="Password" type="password" autoComplete="current-password" required placeholder="Enter your password" autoFocus />
              <button className="ds-button is-large login-submit" type="submit" disabled={busy}>{busy ? 'One moment…' : 'Sign in'}</button>
            </form>
            <div className="login-secondary">
              <form method="post" action="/auth/forgot" onSubmit={onSubmit}>
                <input type="hidden" name="email" value={email} />
                <button type="submit" className="ds-button is-large is-tertiary login-submit" disabled={busy}>Forgot your password?</button>
              </form>
              <OtherEmail onSubmit={onSubmit} busy={busy} />
            </div>
            {unsure && (
              <details className="login-more">
                <summary>New to Accing? Create an account</summary>
                <CreateForm email={email} onSubmit={onSubmit} busy={busy} />
              </details>
            )}
          </>
        )}

        {step === 'create' && (
          <>
            <h1 className="login-title">Create an account</h1>
            <Message message={message} />
            <CreateForm email={email} onSubmit={onSubmit} busy={busy} />
            <OtherEmail onSubmit={onSubmit} busy={busy}>Already have an account? Use another email</OtherEmail>
          </>
        )}

        {preview && (
          <form className="login-preview" method="post" action="/auth/preview" onSubmit={onSubmit}>
            <p>Supabase isn't connected yet. You can still look around.</p>
            <button className="login-link" type="submit" disabled={busy}>Continue with preview account</button>
          </form>
        )}
      </section>
    </main>
  );
}
