'use client';
// Onboarding. Figma file 5evySGmkwmI2tXSjSSezwH, section "Onboarding" (157:291):
// Welcome (166:1968) → Consent (159:320) → step 1 Face front/left/right (159:380, 186:3495, 186:3798), each checked:
// "Looks great!" (186:3714, 186:3867) or a retake hint (161:295) → step 2 Full body (161:347) → step 3 Your
// proportions, optional (161:406) → step 4 Styles, optional (275:12737) → step 5 Pick yourself (162:396), with the
// waiting screen (177:2200, the spinner 220:634) → Welcome to Accing (177:2947) → the mirror. "Skip" on the welcome
// screen leads to the empty mirror (162:545). The worker starts preparing the base photo as soon as the full-body photo
// is in, so it runs while they fill steps 3 and 4.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../ui/Icon.jsx';
import { Checkbox, InfoBox, Spinner, Tag, TextField } from '../ui/kit.jsx';
import { FACE_ANGLES, resumeStep } from '../lib/photo-advice.js';
import { STYLES } from '../lib/styles.js';
import { useCamera, Viewfinder } from './Camera.jsx';
import { fileToJpeg, frameToJpeg } from './resize.js';
import '../ui/components.css';
import './onboarding.css';

const POLL_MS = 4000;
const STEPS = 5;
const MAX_STYLES = 3;

async function post(body) {
  const res = await fetch('/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return res ? res.json().catch(() => ({ error: 'Something went wrong' })) : { error: 'No connection. Try again.' };
}

async function upload(kind, blob) {
  const form = new FormData();
  form.append('kind', kind); form.append('photo', blob, `${kind}.jpg`);
  const res = await fetch('/api/onboarding/photo', { method: 'POST', body: form }).catch(() => null);
  return res ? res.json().catch(() => ({ error: 'Something went wrong' })) : { error: 'No connection. Try again.' };
}

/** onboarding-header (Thread 122:621): back, "Step n of 5", five segments; optional steps get a Tiny Tertiary "Skip"
 *  under it on the right (161:406, 275:12737). */
function Header({ step, onBack, onSkip }) {
  return (
    <div className="ob-header">
      <div className="ob-header-row">
        <button type="button" className="ds-icon-button is-large is-tertiary" onClick={onBack} aria-label="Back"><Icon name="arrow-left" size={24} /></button>
        {step && <p className="ob-step">Step {step} of {STEPS}</p>}
      </div>
      {step && (
        <div className="ob-progress" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className={i < step ? 'is-done' : ''} />)}
        </div>
      )}
      {onSkip && <div className="ob-skip"><button type="button" className="ds-button is-tiny is-tertiary" onClick={onSkip}>Skip</button></div>}
    </div>
  );
}

function Intro({ title, text }) {
  return (
    <div className="ob-intro">
      <h1>{title}</h1>
      {text && <p>{text}</p>}
    </div>
  );
}

/** On the photo, at the bottom of the viewfinder: a retake hint, "Looks great!", or the sunglasses reminder (Info-box). */
export function Notice({ advice, icon = 'alert-circle', type = 'default' }) {
  return (
    <div className="ob-notice" role={type === 'default' && icon === 'alert-circle' ? 'alert' : 'status'}>
      <InfoBox type={type} icon={icon} title={advice.title}>{advice.hint}</InfoBox>
    </div>
  );
}

export function Angles({ done, current }) {
  return (
    <div className="ob-angles" aria-label="Face photos">
      {FACE_ANGLES.map((a, i) => (
        <span key={a.key} className={done[a.key] || i < current ? 'is-done' : ''}>
          <Icon name={done[a.key] || i < current ? 'check-circle' : 'circle'} size={16} />{a.label}
        </span>
      ))}
    </div>
  );
}

/** Shutter row (Figma footer): choose from photos · shutter · flip camera (when there is a second camera). */
export function CaptureBar({ camera, onPhoto, disabled }) {
  const pickRef = useRef(null), shootRef = useRef(null);
  const fromFile = async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(await fileToJpeg(f)); };
  const shoot = async () => {
    if (camera.state === 'live' && camera.videoRef.current?.videoWidth) onPhoto(await frameToJpeg(camera.videoRef.current));
    else shootRef.current?.click(); // no live camera: the phone's own camera app
  };
  return (
    <div className="ob-capture">
      <button type="button" className="ob-icon-button" onClick={() => pickRef.current?.click()} disabled={disabled} aria-label="Choose from your photos"><Icon name="image" size={24} /></button>
      <button type="button" className="ob-shutter" onClick={shoot} disabled={disabled} aria-label="Take the photo"><Icon name="camera" size={24} /></button>
      {camera.canFlip
        ? <button type="button" className="ob-icon-button" onClick={camera.flip} disabled={disabled} aria-label="Switch camera"><Icon name="refresh-cw" size={24} /></button>
        : <span className="ob-icon-button" aria-hidden="true" />}
      <input ref={pickRef} className="visually-hidden" type="file" accept="image/*" tabIndex={-1} onChange={fromFile} />
      <input ref={shootRef} className="visually-hidden" type="file" accept="image/*" capture={camera.mirrored ? 'user' : 'environment'} tabIndex={-1} onChange={fromFile} />
    </div>
  );
}

function Processing({ art, spinner = false, title, text, children }) {
  return (
    <div className="ob-screen">
      <div className="ob-processing" role="status">
        {spinner ? <Spinner label="" className="ob-processing-spinner" /> : <img src={art} alt="" width="154" height="155" />}
        <div><h1>{title}</h1>{text && <p>{text}</p>}</div>
        {children}
      </div>
    </div>
  );
}

export default function Onboarding({ name = '', initial = null }) {
  const router = useRouter();
  const [state, setState] = useState(initial || {});
  const [step, setStep] = useState(() => resumeStep(initial));
  const [angle, setAngle] = useState(() => Math.max(0, FACE_ANGLES.findIndex((a) => !initial?.faces?.[a.key])));
  const [agreed, setAgreed] = useState(false);
  const [still, setStill] = useState(null);       // object URL of the photo being checked / to retake
  const [busy, setBusy] = useState(null);         // "Checking your photo…"
  const [advice, setAdvice] = useState(null);     // { title, hint } from the photo check
  const [problem, setProblem] = useState(null);   // errors from the server
  const [height, setHeight] = useState(''), [weight, setWeight] = useState('');
  const [styles, setStyles] = useState(() => initial?.styles || []);
  const [good, setGood] = useState(false);        // the face photo passed the check: "Looks great!" until Continue
  const [chosen, setChosen] = useState(0);

  const capturing = (step === 'face' || step === 'body') && !still;
  const camera = useCamera(step === 'body' ? 'environment' : 'user', capturing);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/onboarding', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);
  // While the base photo is being prepared (or right after the full-body photo), ask again every few seconds.
  const waiting = step === 'pick' && !state.options?.length && !state.failed;
  useEffect(() => { if (!waiting) return undefined; refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [waiting, refresh]);
  useEffect(() => () => { if (still) URL.revokeObjectURL(still); }, [still]);

  const go = (next) => { setProblem(null); setAdvice(null); setStill(null); setBusy(null); setGood(false); setStep(next); };

  const nextAngle = () => {
    if (angle < FACE_ANGLES.length - 1) { setAngle(angle + 1); setStill(null); setAdvice(null); setGood(false); }
    else go('body');
  };
  const retakePhoto = () => { setStill(null); setAdvice(null); setGood(false); };

  const takePhoto = async (blob) => {
    const kind = step === 'face' ? FACE_ANGLES[angle].key : 'body';
    setProblem(null); setAdvice(null);
    setStill(URL.createObjectURL(blob)); setBusy('Checking your photo…');
    const r = await upload(kind, blob);
    setBusy(null);
    if (r.error) { setProblem(r.error); setStill(null); return; }
    setState((s) => (kind === 'body' ? { ...s, bodyPhoto: true, options: [], failed: null, preparing: !r.advice }
      : { ...s, faces: { ...s.faces, [kind]: true } }));
    if (r.advice) { setAdvice(r.advice); return; }
    if (step === 'face') setGood(true); else go('details');
  };

  const useAnyway = async () => {
    if (step === 'face') { nextAngle(); return; }
    setBusy('Saving…');
    const r = await post({ action: 'prepare' });
    setBusy(null);
    if (r.error) { setProblem(r.error); return; }
    go('details');
  };

  const back = () => {
    if (step === 'consent') go('welcome');
    else if (step === 'face') { if (still) retakePhoto(); else if (angle > 0) setAngle(angle - 1); else go('consent'); }
    else if (step === 'body') { if (still) retakePhoto(); else { setAngle(FACE_ANGLES.length - 1); go('face'); } }
    else if (step === 'details') go('body');
    else if (step === 'styles') go('details');
    else if (step === 'pick') go('styles');
  };

  const run = async (body, next) => {
    setProblem(null);
    const r = await post(body);
    if (r.error) { setProblem(r.error); return false; }
    if (next) next();
    return true;
  };

  // ── 1 Welcome ──
  if (step === 'welcome') {
    return (
      <div className="ob-screen">
        <div className="ob-body ob-body-welcome">
          <div className="ob-hero">
            <img src="/onboarding/welcome.svg" alt="" width="120" height="120" />
            <div className="ob-intro ob-intro-large">
              <h1>{name ? `Welcome, ${name}!` : 'Welcome!'}<br />Let’s set up your mirror</h1>
              <p>Every morning Accing shows you in your own clothes. First, it needs to see you.</p>
            </div>
          </div>
          <ol className="ob-steps">
            <li><strong>Your face</strong><span>3 quick photos: front, left and right</span></li>
            <li><strong>One outfit</strong><span>A head-to-toe photo in clothes you like</span></li>
            <li><strong>Pick yourself</strong><span>Choose the version that looks most like you</span></li>
          </ol>
        </div>
        <div className="ob-footer">
          <p className="ob-time">About 3 minutes.</p>
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
          <button type="button" className="ds-button is-large ob-wide" onClick={() => go(state.consent ? resumeStep({ ...state, consent: true }) : 'consent')}>Let’s start</button>
          <button type="button" className="ob-text-button ob-wide" onClick={() => run({ action: 'later' }, () => router.replace('/'))}>Skip</button>
        </div>
      </div>
    );
  }

  // ── 2 Consent ──
  if (step === 'consent') {
    return (
      <div className="ob-screen">
        <Header onBack={back} />
        <div className="ob-body">
          <div className="ob-hero">
            <img src="/onboarding/consent.svg" alt="" width="118" height="120" />
            <div className="ob-intro ob-intro-large">
              <h1>Your face stays yours</h1>
            </div>
          </div>
          <ul className="ob-checks">
            <li><Icon name="check" size={20} />Gemini and OpenAI process your face and outfit photos to generate your looks.</li>
            <li><Icon name="check" size={20} />A biometric face template helps check that generated looks resemble you.</li>
            <li><Icon name="check" size={20} />You can update your face photos in Settings.</li>
            <li><Icon name="check" size={20} />You can delete your account and all its data in Settings.</li>
          </ul>
        </div>
        <div className="ob-footer">
          <Checkbox checked={agreed} onChange={setAgreed}>I agree to the photo and face-template processing described above.</Checkbox>
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
          <button type="button" className="ds-button is-large ob-wide" disabled={!agreed}
            onClick={() => run({ action: 'consent' }, () => { setState((s) => ({ ...s, consent: true })); go(resumeStep({ ...state, consent: true })); })}>Let’s start</button>
        </div>
      </div>
    );
  }

  // ── 3–5 Face photos, retake, full body ──
  if (step === 'face' || step === 'body') {
    const a = FACE_ANGLES[angle];
    const retake = Boolean(advice) && !busy;
    const great = step === 'face' && good && still && !busy;
    const last = angle === FACE_ANGLES.length - 1;
    const notice = retake ? <Notice advice={advice} />
      : great ? <Notice advice={{ title: 'Looks great!' }} icon="star" />
      : step === 'face' && a.key === 'front' && !still ? <Notice advice={{ title: 'Remove your sunglasses.' }} type="warning" />
      : null;
    return (
      <div className="ob-screen">
        <Header step={step === 'face' ? 1 : 2} onBack={back} />
        <div className="ob-body ob-body-capture">
          {step === 'face'
            ? <Intro title={a.title} text={a.text} />
            : <Intro title="Add your first outfit" text="Wear an outfit you like and keep your whole body in the frame, including your feet." />}
          <div className="ob-capture-area">
            <Viewfinder camera={camera} guide={step === 'face' ? 'face' : 'body'} angle={a.key} still={still} busy={busy} notice={notice} />
            {step === 'face'
              ? <Angles done={{ ...(state.faces || {}), ...(great ? { [a.key]: true } : {}) }} current={angle} />
              : <p className="ob-info"><Icon name="info" size={16} />Take your photo against a plain wall in daylight. A mirror selfie or a photo taken with a timer is fine.</p>}
          </div>
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
        </div>
        {retake || great ? (
          <div className="ob-footer ob-footer-pair">
            <button type="button" className="ds-button is-large is-secondary" onClick={retakePhoto}><Icon name="camera" size={20} />Retake</button>
            {great
              ? <button type="button" className="ds-button is-large" onClick={nextAngle}>{last ? 'Go to outfit' : 'Continue'}</button>
              : <button type="button" className="ds-button is-large" onClick={useAnyway}>Use it anyway</button>}
          </div>
        ) : <CaptureBar camera={camera} onPhoto={takePhoto} disabled={Boolean(busy)} />}
      </div>
    );
  }

  // ── Step 3: Your proportions (optional) ──
  if (step === 'details') {
    const save = () => (height || weight ? run({ action: 'details', height, weight }, () => go('styles')) : go('styles'));
    return (
      <div className="ob-screen">
        <Header step={3} onBack={back} onSkip={() => go('styles')} />
        <form className="ob-body" id="ob-details" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Intro title="Your proportions" text="Your height and weight are shared with external providers to personalize your outfit previews." />
          <div className="ob-fields">
            <TextField label="Height" unit="cm" inputMode="numeric" autoComplete="off" placeholder="170" value={height} onChange={(e) => setHeight(e.target.value)} />
            <TextField label="Weight" unit="kg" inputMode="numeric" autoComplete="off" placeholder="58" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
        </form>
        <div className="ob-footer ob-footer-roomy">
          <button type="submit" form="ob-details" className="ds-button is-large ob-wide" disabled={!height && !weight}>Continue</button>
        </div>
      </div>
    );
  }

  // ── Step 4: How do you express yourself? (optional) ──
  if (step === 'styles') {
    const toggle = (x) => setStyles((l) => (l.includes(x) ? l.filter((y) => y !== x) : l.length < MAX_STYLES ? [...l, x] : l));
    return (
      <div className="ob-screen">
        <Header step={4} onBack={back} onSkip={() => go('pick')} />
        <div className="ob-body">
          <Intro title="How do you express yourself?" text="Choose up to 3 styles that feel like you." />
          <div className="ob-tags" role="group" aria-label="Styles">
            {STYLES.map((x) => <Tag key={x} selected={styles.includes(x)} disabled={!styles.includes(x) && styles.length >= MAX_STYLES} onClick={() => toggle(x)}>{x}</Tag>)}
          </div>
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
        </div>
        <div className="ob-footer ob-footer-roomy">
          <button type="button" className="ds-button is-large ob-wide" disabled={!styles.length} onClick={() => run({ action: 'styles', styles }, () => go('pick'))}>Continue</button>
        </div>
      </div>
    );
  }

  // ── Step 5: Pick yourself ──
  if (step === 'pick') {
    const options = state.options || [];
    if (state.failed) {
      return (
        <Processing art="/onboarding/loading.svg" title="Let’s try another photo" text={state.failed}>
          <button type="button" className="ds-button is-large ob-wide" onClick={() => go('body')}>Take another photo</button>
        </Processing>
      );
    }
    if (!options.length && !state.preparing) {
      return (
        <Processing art="/onboarding/loading.svg" title="Ready to prepare your photo" text="We’ll turn your full-body photo into the one every look starts from.">
          <button type="button" className="ds-button is-large ob-wide" onClick={() => run({ action: 'prepare' }, () => setState((s) => ({ ...s, preparing: true })))}>Prepare it</button>
          <button type="button" className="ob-text-button ob-wide" onClick={() => go('body')}>Take another photo</button>
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
        </Processing>
      );
    }
    if (!options.length) {
      return <Processing spinner title="Preparing your photo" text="This takes about a minute. You can leave the app; it keeps going." />;
    }
    const sel = options[Math.min(chosen, options.length - 1)];
    return (
      <div className="ob-screen">
        <Header step={5} onBack={back} />
        <div className="ob-body ob-body-pick">
          <Intro title="Which one looks most like you?" text="Choose the image that looks most like you for your outfit previews." />
          <div className="ob-picked"><img src={sel.url} alt="The selected version of you" /></div>
          {options.length > 1 && (
            <div className="ob-versions" role="radiogroup" aria-label="Versions">
              {options.map((o, i) => (
                <button key={o.path} type="button" role="radio" aria-checked={o === sel} aria-label={`Version ${i + 1}`} onClick={() => setChosen(i)}>
                  <img src={o.url} alt="" />
                  {o === sel && <span className="ob-version-check"><Icon name="check" size={14} /></span>}
                </button>
              ))}
            </div>
          )}
          {problem && <p className="ob-problem" role="alert">{problem}</p>}
        </div>
        <div className="ob-footer ob-footer-roomy">
          <button type="button" className="ds-button is-large ob-wide"
            onClick={async () => { setStep('finishing'); if (await run({ action: 'pick', path: sel.path })) { setStep('done'); setTimeout(() => router.replace('/'), 2200); } else setStep('pick'); }}>This is me</button>
          <button type="button" className="ob-text-button ob-wide" onClick={() => go('body')}>None of these look like me</button>
        </div>
      </div>
    );
  }

  if (step === 'finishing') return <Processing spinner title="Finishing your look" text="It may take up to a minute." />;
  return (
    <Processing art="/onboarding/unicorn.svg" title="Welcome to Accing!" text="Your digital mirror is ready.">
      <button type="button" className="ob-text-button" onClick={() => router.replace('/')}>Open my mirror</button>
    </Processing>
  );
}
