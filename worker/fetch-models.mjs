// Downloads the two local models into image-test/models once, at image build time, so a woken worker never waits for
// a 350 MB download: ISNet (background cut-out) and InsightFace buffalo_l (face detection and identity).
import { join, resolve } from 'node:path';
import { createCleaner } from '../scripts/clean-background.mjs';
import { ensureModels } from '../scripts/face-check/arcface.mjs';

const models = join(resolve(import.meta.dirname, '..'), 'image-test', 'models');
await createCleaner(models);
await ensureModels(join(models, 'buffalo_l'));
console.log('Models ready in', models);
