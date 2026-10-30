import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyAdvice, bodyNote, faceAdvice, resumeStep } from '../src/lib/photo-advice.js';
import { fitScale } from '../src/onboarding/resize.js';

const goodFace = { one_face: true, face_visible: true, sharp: true, well_lit: true, face_small: false, turn: 'straight', chin: 'level' };

test('a good front photo passes; a side photo must be turned', () => {
  assert.equal(faceAdvice('front', goodFace), null);
  assert.match(faceAdvice('left', goodFace).title, /Turn your head/);
  assert.equal(faceAdvice('right', { ...goodFace, turn: 'turned' }), null);
  assert.match(faceAdvice('front', { ...goodFace, turn: 'turned' }).title, /turned/);
});

test('one problem at a time, the blocking ones first', () => {
  assert.match(faceAdvice('front', { ...goodFace, chin: 'up', sharp: false }).title, /blurry/);
  assert.match(faceAdvice('front', { ...goodFace, chin: 'up' }).title, /chin is a little up/);
  assert.equal(faceAdvice('front', null), null, 'no reading (no key, call failed): accepted');
});

test('full body: missing feet or two people ask for a retake; a mirror selfie does not', () => {
  const ok = { one_person: true, full_body: true, face_visible: true, sharp: true, sitting: false };
  assert.equal(bodyAdvice(ok), null);
  assert.match(bodyAdvice({ ...ok, full_body: false }).hint, /both feet/);
  assert.match(bodyAdvice({ ...ok, one_person: false }).title, /More than one/);
  assert.equal(bodyAdvice({ ...ok, mirror_selfie: true }), null);
});

test('onboarding resumes where the person left', () => {
  assert.equal(resumeStep(null), 'welcome');
  assert.equal(resumeStep({ consent: false }), 'welcome');
  assert.equal(resumeStep({ consent: true, faces: { front: true } }), 'face');
  assert.equal(resumeStep({ consent: true, faces: { front: true, left: true, right: true } }), 'body');
  assert.equal(resumeStep({ consent: true, faces: { front: true, left: true, right: true }, bodyPhoto: true }), 'pick');
  assert.equal(resumeStep({ basePath: 'x' }), 'done');
});

test('height and weight become the body note; nonsense is left out', () => {
  assert.equal(bodyNote('170', '58'), 'height 170 cm, weight 58 kg');
  assert.equal(bodyNote('1,72 m', ''), null);
  assert.equal(bodyNote('', '61.4 kg'), 'weight 61 kg');
  assert.equal(bodyNote('', ''), null);
});

test('photos are scaled down to 2048 px on the long side, never up', () => {
  assert.equal(fitScale(4032, 3024), 2048 / 4032);
  assert.equal(fitScale(1080, 1920), 2048 / 1920 > 1 ? 1 : 2048 / 1920);
  assert.equal(fitScale(800, 600), 1);
});
