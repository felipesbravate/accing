'use client';
// Update face photos (Figma 297:3383 current → 305:3626/3682/3653 take each → 305:3735… "Looks great!" → 306:4398
// review → 395:2886 discard? → Update photos → 395:2615 pick yourself → 395:2996 "New photos saved").
// New photos are kept apart until "Update photos"; the current base photo stays in use until "This is me", then
// today's suggestions are remade at once and the other looks 2 an hour (src/server/account.js).
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../ui/Icon.jsx';
import { Modal, Spinner, TopNav } from '../ui/kit.jsx';
import { FACE_ANGLES } from '../lib/photo-advice.js';
import { useCamera, Viewfinder } from '../onboarding/Camera.jsx';
import { Angles, CaptureBar, Notice } from '../onboarding/Onboarding.jsx';
import { Screen, api, apiUpload } from './Account.jsx';
import '../onboarding/onboarding.css';

const ORDER = ['left', 'front', 'right']; // how the three are shown (Left, Front, Right); taken front, left, right
const POLL_MS = 4000;

export default function Faces({ initial }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [step, setStep] = useState(() => (initial.options?.length ? 'pick' : initial.preparing ? 'waiting' : 'overview'));
  const [angle, setAngle] = useState(0);
  const [still, setStill] = useState(null), [busy, setBusy] = useState(null), [advice, setAdvice] = useState(null), [good, setGood] = useState(false);
  const [problem, setProblem] = useState(null), [asking, setAsking] = useState(false), [saved, setSaved] = useState(false), [chosen, setChosen] = useState(0);
  const camera = useCamera('user', step === 'capture' && !still);
  const allNew = FACE_ANGLES.every((a) => state.fresh?.[a.key]);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/account?view=faces', { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const s = await res.json();
    setState(s);
    if (s.options?.length) setStep('pick'); else if (s.failed) setStep('failed');
  }, []);
  useEffect(() => { if (step !== 'waiting') return undefined; const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [step, refresh]);
  useEffect(() => () => { if (still) URL.revokeObjectURL(still); }, [still]);

  const startCapture = () => { setAngle(0); setStill(null); setAdvice(null); setGood(false); setProblem(null); setStep('capture'); };
  const retake = () => { setStill(null); setAdvice(null); setGood(false); };
  const next = () => {
    if (angle < FACE_ANGLES.length - 1) { setAngle(angle + 1); retake(); return; }
    retake(); setStep('overview'); refresh();
  };
  const takePhoto = async (blob) => {
    const a = FACE_ANGLES[angle];
    setProblem(null); setAdvice(null); setStill(URL.createObjectURL(blob)); setBusy('Checking your photo…');
    const r = await apiUpload({ kind: 'face', angle: a.key }, blob);
    setBusy(null);
    if (r.error) { setProblem(r.error); setStill(null); return; }
    setState((s) => ({ ...s, fresh: { ...s.fresh, [a.key]: true } }));
    if (r.advice) setAdvice(r.advice); else setGood(true);
  };
  const commit = async () => {
    setBusy('Saving…'); setProblem(null);
    const r = await api({ action: 'faces-commit' });
    setBusy(null);
    if (r.error) { setProblem(r.error); return; }
    setStep('waiting');
  };
  const discard = async () => { setAsking(false); await api({ action: 'faces-discard' }); router.push('/settings'); };
  const cancel = () => (Object.values(state.fresh || {}).some(Boolean) ? setAsking(true) : router.push('/settings'));

  if (step === 'capture') {
    const a = FACE_ANGLES[angle];
    const great = good && still && !busy, retaking = Boolean(advice) && !busy;
    const notice = retaking ? <Notice advice={advice} /> : great ? <Notice advice={{ title: 'Looks great!' }} icon="star" />
      : a.key === 'front' && !still ? <Notice advice={{ title: 'Remove your sunglasses.' }} type="warning" /> : null;
    return (
      <div className="ob-screen">
        <TopNav title="Update face photos" onBack={() => (still ? retake() : angle > 0 ? setAngle(angle - 1) : setStep('overview'))} />
        <div className="ob-body ob-body-capture">
          <div className="ob-intro"><h1>{a.title}</h1><p>{a.text}</p></div>
          <div className="ob-capture-area">
            <Viewfinder camera={camera} guide="face" angle={a.key} still={still} busy={busy} notice={notice} />
            <Angles done={Object.fromEntries(FACE_ANGLES.map((x, i) => [x.key, i < angle || (i === angle && great)]))} current={angle} />
          </div>
          {problem && <p className="acc-problem" role="alert">{problem}</p>}
        </div>
        {great || retaking ? (
          <div className="ob-footer ob-footer-pair">
            <button type="button" className="ds-button is-large is-secondary" onClick={retake}><Icon name="camera" size={20} />Retake</button>
            <button type="button" className="ds-button is-large" onClick={next}>{great ? 'Continue' : 'Use it anyway'}</button>
          </div>
        ) : <CaptureBar camera={camera} onPhoto={takePhoto} disabled={Boolean(busy)} />}
      </div>
    );
  }

  if (step === 'waiting' || step === 'failed') {
    return (
      <Screen title="Update face photos" back="/settings">
        <div className="ob-processing" role="status">
          {step === 'waiting' ? <Spinner label="" className="ob-processing-spinner" /> : <Icon name="alert-circle" size={48} />}
          <div>
            <h1>{step === 'waiting' ? 'Preparing your photo' : 'Let’s try other photos'}</h1>
            <p>{step === 'waiting' ? 'This takes about a minute. You can leave the app; it keeps going.' : state.failed}</p>
          </div>
          {step === 'failed' && <button type="button" className="ds-button is-large acc-wide" onClick={startCapture}>Take new photos</button>}
        </div>
      </Screen>
    );
  }

  if (step === 'pick') {
    const options = state.options || [];
    const sel = options[Math.min(chosen, options.length - 1)];
    const pickIt = async () => {
      setBusy('Saving…'); setProblem(null);
      const r = await api({ action: 'faces-pick', path: sel.path });
      setBusy(null);
      if (r.error) setProblem(r.error); else setSaved(true);
    };
    return (
      <Screen title="Update face photos" back="/settings"
        footer={<>
          <button type="button" className="ds-button is-large acc-wide" onClick={pickIt} disabled={Boolean(busy)}>{busy || 'This is me'}</button>
          <button type="button" className="ds-button is-large is-tertiary acc-wide" onClick={startCapture}>None of these look like me</button>
        </>}>
        <div className="ob-intro"><h1>Which one looks most like you?</h1><p>Choose the image that looks most like you for your outfit previews.</p></div>
        <div className="ob-picked"><img src={sel.url} alt="The selected version of you" /></div>
        {options.length > 1 && (
          <div className="ob-versions" role="radiogroup" aria-label="Versions">
            {options.map((o, i) => (
              <button key={o.path} type="button" role="radio" aria-checked={o === sel} aria-label={`Version ${i + 1}`} onClick={() => setChosen(i)}>
                <img src={o.url} alt="" />{o === sel && <span className="ob-version-check"><Icon name="check" size={14} /></span>}
              </button>
            ))}
          </div>
        )}
        {problem && <p className="acc-problem" role="alert">{problem}</p>}
        {saved && (
          <Modal title="New photos saved" description="Your outfits will now be shown using your new photos." onClose={() => router.push('/settings')}>
            <button type="button" className="ds-button is-large" onClick={() => router.push('/settings')}>Done</button>
          </Modal>
        )}
      </Screen>
    );
  }

  // Overview (297:3383) / review (306:4398)
  const shown = allNew ? state.fresh : state.current;
  return (
    <Screen title="Face photos" back="/settings"
      footer={<>
        <button type="button" className="ds-button is-large acc-wide" disabled={!allNew || Boolean(busy)} onClick={commit}>{busy || 'Update photos'}</button>
        <button type="button" className="ds-button is-large is-tertiary acc-wide" onClick={cancel}>Cancel</button>
      </>}>
      <span className="acc-face-icon"><Icon name="camera" size={24} /></span>
      <div className="acc-intro"><h1>Update face photos</h1><p>Change the photos used to generate your outfit previews.</p></div>
      <section className="acc-face-set">
        <h2>{allNew ? 'New photos' : 'Current photos'}</h2>
        <ul className="acc-faces">
          {ORDER.map((k) => {
            const a = FACE_ANGLES.find((x) => x.key === k);
            return <li key={k}><span className="acc-face-img">{shown?.[k] ? <img src={shown[k]} alt={`${a.label} photo`} /> : null}</span>{a.label}</li>;
          })}
        </ul>
      </section>
      <div className="acc-take">
        <button type="button" className="ds-button is-secondary" onClick={startCapture}><Icon name="camera" size={20} />{allNew ? 'Retake photos' : 'Take new photos'}</button>
        <p className="acc-face-note">For outfit previews, not your profile photo.</p>
      </div>
      {problem && <p className="acc-problem" role="alert">{problem}</p>}
      {asking && (
        <Modal title="Discard new photos?" description="Your new face photos won’t be saved. Your current photos will stay unchanged." onClose={() => setAsking(false)}>
          <button type="button" className="ds-button is-large is-tertiary" onClick={() => setAsking(false)}>Go back</button>
          <button type="button" className="ds-button is-large" onClick={discard}>Discard photos</button>
        </Modal>
      )}
    </Screen>
  );
}
