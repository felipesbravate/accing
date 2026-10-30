import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseOptions, inputsFor, outfitRows, ownPath, pipelineArgs } from '../worker/jobs.mjs';

const U = '11111111-1111-1111-1111-111111111111';
const user = { id: U, face_front_path: `${U}/faces/front.jpg`, face_left_path: `${U}/faces/left.png`, face_right_path: `${U}/faces/right.jpg`, base_source_path: `${U}/base-source/base.jpg`, base_path: `${U}/base/j1/base-prepared-2.png` };

test('the worker only reads files from the user\'s own folder', () => {
  assert.equal(ownPath(U, `${U}/faces/front.jpg`), true);
  assert.equal(ownPath(U, `22222222-2222-2222-2222-222222222222/faces/front.jpg`), false);
  assert.equal(ownPath(U, `${U}/../other/x.jpg`), false);
  assert.throws(() => inputsFor({ ...user, face_left_path: 'someone-else/faces/left.jpg' }, [{ id: 'p', path: `${U}/photos/a.jpg` }]), /face left/);
  assert.throws(() => inputsFor(user, [{ id: 'p', path: 'someone-else/photos/a.jpg' }]), /full-body photo/);
});

test('inputs: faces, base, outfit photos in order, and the picked base outside the input folder', () => {
  const files = inputsFor(user, [{ id: 'a', path: `${U}/photos/01.jpg` }, { id: 'b', path: `${U}/photos/02.PNG` }], { prepared: true });
  assert.deepEqual(files.map((f) => f.as), ['face-front.jpg', 'face-left.png', 'face-right.jpg', 'base.jpg', 'photo-01.jpg', 'photo-02.png', null]);
  assert.equal(files.at(-1).prepared, true);
  assert.throws(() => inputsFor({ ...user, base_path: null }, [{ id: 'a', path: `${U}/photos/01.jpg` }], { prepared: true }), /Pick your base/);
});

test('pipeline arguments keep quality fixed and bound what the app can ask', () => {
  const prep = pipelineArgs({ job_type: 'prepare_base', payload: {} }, 'job-1', '/t/s.json');
  assert.ok(prep.includes('--prep-only') && prep.includes('--reprep') && prep.includes('--hd'));
  const looks = pipelineArgs({ job_type: 'make_looks', payload: { looks: 40, occasion: ' dinner date ', weather: '' } }, 'job-1', '/t/s.json', '/t/prepared.png');
  assert.ok(looks.includes('--looks=6') && looks.includes('--occasion=dinner date') && looks.includes('--weather=mild') && looks.includes('--prepared=/t/prepared.png'));
  assert.throws(() => pipelineArgs({ job_type: 'drop_table' }, 'p', 'x'), /Unknown job type/);
  assert.ok(pipelineArgs({ job_type: 'prepare_base' }, 'p', 'x', null, '/t/cutouts').includes('--cutout-cache=/t/cutouts'));
});

test('one outfit row per look asked for, with the image only for ready ones', () => {
  const summary = { looks: [
    { n: 1, status: 'ready', file: 'a.png', items: [{ description: 'tee' }], cost: 0.05, identity: 0.84 },
    { n: 2, status: 'dropped', items: [], reasons: ['outfit: different jacket'], retake: 'retake the photo of the jacket', cost: 0.15 },
    { n: 3, status: 'refused', items: [], reasons: ['refused by OpenAI'], cost: 0 },
  ] };
  const rows = outfitRows({ id: 'j', user_id: U, payload: { occasion: 'an office day' } }, summary, { 1: `${U}/looks/j/look1.png` });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].generated_image_path, `${U}/looks/j/look1.png`);
  assert.equal(rows[1].generated_image_path, null);
  assert.equal(rows[1].retake, 'retake the photo of the jacket');
  assert.equal(rows[2].validation_status, 'failed');
});

test('base options: passing tries only, best identity first', () => {
  const s = { prep: [{ file: 'b1.png', ok: true, identity: 0.81 }, { file: 'b2.png', ok: false, identity: 0.9 }, { file: 'b3.png', ok: true, identity: 0.86, best: true }] };
  const o = baseOptions(s, { 'b1.png': 'u/b1', 'b3.png': 'u/b3' });
  assert.deepEqual(o.map((x) => x.path), ['u/b3', 'u/b1']);
  assert.equal(o[0].best, true);
});
