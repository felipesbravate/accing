'use client';
// The onboarding viewfinder: a live camera (getUserMedia) with the Figma guides drawn on top — an oval with a turning
// meridian for the face (Onboarding 3, 159:380) and a dashed capsule for the full body (Onboarding 5, 161:347).
// The front camera preview is mirrored like a mirror; the photo itself is saved the way the camera sees it.
// Where the camera can't be used (no permission, desktop without a webcam, an in-app browser), the shutter falls back
// to the phone's own camera through a file input.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCamera(facing, enabled = true) {
  const videoRef = useRef(null);
  const [mode, setMode] = useState(facing);
  const [state, setState] = useState('starting'); // starting | live | unavailable
  const [canFlip, setCanFlip] = useState(false);
  useEffect(() => setMode(facing), [facing]);
  useEffect(() => {
    if (!enabled) return undefined;
    let stream = null, stopped = false;
    setState('starting');
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1920 } } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        setState('live');
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
      } catch { setState('unavailable'); }
    })();
    return () => { stopped = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [mode, enabled]);
  const flip = useCallback(() => setMode((m) => (m === 'user' ? 'environment' : 'user')), []);
  return { videoRef, state, mirrored: mode === 'user', canFlip, flip };
}

/** The meridian for each angle: a vertical line through the oval that bends the way the face should turn. */
function meridian(angle) {
  if (angle === 'left') return 'M122 51 Q 60 211 122 371';
  if (angle === 'right') return 'M122 51 Q 184 211 122 371';
  return 'M122 51 L 122 371';
}

function FaceGuide({ angle }) {
  return (
    <svg className="ob-guide" viewBox="0 0 342 423" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <mask id="ob-face-hole"><rect width="342" height="423" fill="white" /><ellipse cx="171" cy="211.5" rx="122" ry="160" fill="black" /></mask>
      </defs>
      <rect width="342" height="423" className="ob-guide-dim" mask="url(#ob-face-hole)" />
      <g transform="translate(49 0)" className="ob-guide-line">
        <ellipse cx="122" cy="211.5" rx="122" ry="160" />
        <path d={meridian(angle)} />
        <path d="M0 196 Q 122 226 244 196" />
      </g>
    </svg>
  );
}

function BodyGuide() {
  return (
    <svg className="ob-guide" viewBox="0 0 342 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <mask id="ob-body-hole"><rect width="342" height="440" fill="white" /><rect x="61" y="18.5" width="220" height="403" rx="110" fill="black" /></mask>
      </defs>
      <rect width="342" height="440" className="ob-guide-dim" mask="url(#ob-body-hole)" />
      <rect x="61" y="18.5" width="220" height="403" rx="110" className="ob-guide-line" />
    </svg>
  );
}

/** guide: 'face' | 'body'. still: the photo just taken (object URL) shown instead of the live view. */
export function Viewfinder({ camera, guide, angle, still, busy, notice, className = '' }) {
  return (
    <div className={`ob-viewfinder is-${guide} ${className}`.trim()}>
      <video ref={camera.videoRef} className={camera.mirrored ? 'is-mirrored' : ''} playsInline muted autoPlay
        hidden={Boolean(still) || camera.state !== 'live'} />
      {still && <img src={still} alt="The photo you just took" />}
      {!still && camera.state === 'unavailable' && (
        <p className="ob-viewfinder-note">The camera isn’t available here. Tap the camera button to take a photo, or choose one from your photos.</p>
      )}
      {!still && (guide === 'face' ? <FaceGuide angle={angle} /> : <BodyGuide />)}
      {busy && <div className="ob-viewfinder-busy" role="status"><span className="ob-spinner" aria-hidden="true" />{busy}</div>}
      {notice}
    </div>
  );
}
