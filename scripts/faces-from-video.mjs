// Turns a short face video (head turning left and right) into face-1.jpg … face-N.jpg in image-test/inputs.
// Existing face photos are moved into a dated subfolder, not deleted, so you can switch back.
// Usage: npm run faces-from-video -- <path-to-video> [--frames=5]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const INPUTS = join(ROOT, 'image-test', 'inputs');
const args = process.argv.slice(2);
const video = args.find((a) => !a.startsWith('--'));
const frames = parseInt((args.find((a) => a.startsWith('--frames=')) || '--frames=5').split('=')[1], 10);

if (!video) { console.error('Usage: npm run faces-from-video -- <path-to-video> [--frames=5]'); process.exit(1); }
if (!existsSync(video)) { console.error(`Video not found: ${video}`); process.exit(1); }
if (!(frames >= 2 && frames <= 10)) { console.error('--frames must be between 2 and 10'); process.exit(1); }
try { execFileSync('xcrun', ['--find', 'swift'], { stdio: 'ignore' }); } catch {
  console.error('Swift is not available. Install Xcode or run: xcode-select --install'); process.exit(1);
}

await mkdir(INPUTS, { recursive: true });
const faces = (await readdir(INPUTS)).filter((f) => /^face-/i.test(f));
if (faces.length) {
  const backup = join(INPUTS, 'previous-faces-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  await mkdir(backup);
  for (const f of faces) await rename(join(INPUTS, f), join(backup, f));
  console.log(`Moved ${faces.length} existing face photo(s) to ${backup}`);
}
console.log(`Extracting ${frames} frames from ${video}… (the first run compiles a small Swift helper, ~10 s)`);
execFileSync('swift', [join(ROOT, 'scripts', 'extract-frames.swift'), resolve(video), INPUTS, String(frames)], { stdio: 'inherit' });
console.log(`\nDone. Open image-test/inputs to check the frames: delete any blurry one or one with closed eyes.`);
