// What to tell the person about a photo they just took in onboarding. Pure (tested in tests/onboarding.test.js); the
// reading comes from src/server/photo-check.js. Only problems the pipeline can't fix ask for a retake: a phone in the
// hand, a mirror or a messy room in the full-body photo are fixed when the base photo is prepared.

export const FACE_ANGLES = [
  { key: 'front', label: 'Front', title: 'Front-facing photo', text: 'Look straight into the camera and ensure your face is well-lit.' },
  { key: 'left', label: 'Left', title: 'Left-facing photo', text: 'Turn your face in around 45º angle into the camera and ensure your face is well-lit.' },
  { key: 'right', label: 'Right', title: 'Right-facing photo', text: 'Turn your face in around 45º angle into the camera and ensure your face is well-lit.' },
];

/** reading: { one_face, face_visible, sharp, well_lit, turn: 'straight'|'turned', chin: 'level'|'up'|'down', face_small }.
 *  Returns null when the photo is fine, else { title, hint } for the first problem (one thing to fix at a time). */
export function faceAdvice(angle, r) {
  if (!r) return null;
  if (r.one_face === false) return { title: 'More than one face', hint: 'Make sure only you are in the photo.' };
  if (r.face_visible === false) return { title: 'Your face is partly covered', hint: 'Move hair, hands or glasses away from your face.' };
  if (r.sharp === false) return { title: 'The photo is blurry', hint: 'Hold the phone still and take it again.' };
  if (r.well_lit === false) return { title: 'Your face is too dark', hint: 'Face a window or a lamp so the light falls on your face.' };
  if (r.face_small) return { title: 'Come a little closer', hint: 'Your face should fill the oval.' };
  if (angle === 'front' && r.turn === 'turned') return { title: 'Your face is turned', hint: 'Look straight into the camera, nose to the centre of the oval.' };
  if (angle !== 'front' && r.turn === 'straight') return { title: 'Turn your head a little more', hint: 'Turn your face about 45º, as if looking past your shoulder.' };
  if (r.chin === 'up') return { title: 'Your chin is a little up', hint: 'Hold the phone at eye level and keep your chin level, like a passport photo.' };
  if (r.chin === 'down') return { title: 'Your chin is a little down', hint: 'Hold the phone at eye level and keep your chin level, like a passport photo.' };
  return null;
}

/** reading: { one_person, full_body, face_visible, sharp, sitting } (the full-body photo check). */
export function bodyAdvice(r) {
  if (!r) return null;
  if (r.one_person === false) return { title: 'More than one person', hint: 'Make sure only you are in the photo.' };
  if (r.full_body === false) return { title: 'Your whole body isn’t in the photo', hint: 'Step back until your head and both feet are in the frame.' };
  if (r.sitting) return { title: 'Stand up for this one', hint: 'Stand straight with your arms relaxed at your sides.' };
  if (r.face_visible === false) return { title: 'Your face is covered', hint: 'Keep the phone away from your face, or use the timer.' };
  if (r.sharp === false) return { title: 'The photo is blurry or dark', hint: 'Stand in daylight and hold the phone still.' };
  return null;
}

/** The onboarding screen to open, from what the person has done so far. */
export function resumeStep(s) {
  if (!s) return 'welcome';
  if (s.basePath) return 'done';
  if (!s.consent) return 'welcome';
  const faces = FACE_ANGLES.findIndex((a) => !s.faces?.[a.key]);
  if (faces >= 0) return 'face';
  if (!s.bodyPhoto) return 'body';
  return 'pick';
}

/** Parses "170" / "170 cm" style answers into a body note for the pipeline ("height 170 cm, weight 58 kg"). Out of
 *  range or empty values are left out. */
export function bodyNote(height, weight) {
  const n = (v, lo, hi) => { const x = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(x) && x >= lo && x <= hi ? Math.round(x) : null; };
  const h = n(height, 100, 250), w = n(weight, 30, 300);
  return [h && `height ${h} cm`, w && `weight ${w} kg`].filter(Boolean).join(', ') || null;
}
