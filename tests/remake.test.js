import test from 'node:test';
import assert from 'node:assert/strict';
import { sameReadGarment } from '../scripts/image-test-lib.mjs';
import { pipelineArgs } from '../worker/jobs.mjs';

const w = [
  { photo: 0, category: 'top', description: 'black graphic t-shirt with red print' },
  { photo: 0, category: 'bottom', description: 'beige wide-leg linen trousers' },
  { photo: 1, category: 'top', description: 'light blue halter top' },
  { photo: 1, category: 'top', description: 'white cropped cardigan' },
];
test('sameReadGarment: same photo and kind, worded alike or the only one', () => {
  assert.equal(sameReadGarment({ photo: 0, category: 'top', description: 'black t-shirt with a red graphic print' }, w[0], w), true);
  assert.equal(sameReadGarment({ photo: 0, category: 'bottom', description: 'tan pleated pants' }, w[1], w), true); // only bottom in photo 0
  assert.equal(sameReadGarment({ photo: 1, category: 'top', description: 'navy knit vest' }, w[2], w), false); // two tops in photo 1
  assert.equal(sameReadGarment({ photo: 1, category: 'top', description: 'black graphic t-shirt with red print' }, w[0], w), false); // other photo
});
test('pipelineArgs: a remake makes one look with the remake and removed files', () => {
  const a = pipelineArgs({ job_type: 'remake_look', payload: { occasion: 'dinner out', weather: '18°C high' } }, 'p', 'out.json', 'base.png', null, null, null, { remakeFile: 'r.json', removeFile: 'x.json' });
  assert.ok(a.includes('--looks=1') && a.includes('--remake=r.json') && a.includes('--remove=x.json') && a.includes('--occasion=dinner out') && a.includes('--prepared=base.png'));
});
