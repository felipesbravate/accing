// Layer 1 of the face check: is this the same person? ArcFace face embeddings (InsightFace "buffalo_l":
// SCRFD-10G detector + ResNet-50 recogniser trained on WebFace600K), run locally with onnxruntime.
// The score is the cosine similarity between the generated face and the average of the reference faces.
// Licence: InsightFace's pretrained models are for non-commercial research only. Fine for this test; the product
// needs a commercial licence from InsightFace or a differently licensed model.
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const MODEL_URL = 'https://github.com/deepinsight/insightface/releases/download/model-zoo/buffalo_l.zip';
const FILES = ['det_10g.onnx', 'w600k_r50.onnx'];
const DET_SIZE = 640;
const DET_THRESHOLD = 0.5;
const NMS_THRESHOLD = 0.4;
// Where the 5 landmarks (eyes, nose tip, mouth corners) go in the 112×112 crop ArcFace was trained on.
const ARCFACE_DST = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

async function deps() {
  try {
    const [ort, sharp] = await Promise.all([import('onnxruntime-node'), import('sharp')]);
    return { ort: ort.default ?? ort, sharp: sharp.default ?? sharp };
  } catch {
    throw new Error('The face check needs two packages. Run: npm install --save-dev onnxruntime-node sharp');
  }
}

/** Downloads the two model files once (about 280 MB zip, 190 MB kept) into `dir`. */
export async function ensureModels(dir, log = console.log) {
  if (FILES.every((f) => existsSync(join(dir, f)))) return;
  await mkdir(dir, { recursive: true });
  const zip = join(dir, 'buffalo_l.zip');
  log(`Downloading the face recognition model once (~280 MB) from ${MODEL_URL}…`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed (${res.status}). Download ${MODEL_URL} by hand and unzip ${FILES.join(' and ')} into ${dir}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
  try {
    execFileSync('unzip', ['-o', '-j', zip, ...FILES, '-d', dir], { stdio: 'ignore' });
  } catch {
    // Some zips keep the files in a folder; match them anywhere.
    execFileSync('unzip', ['-o', '-j', zip, ...FILES.map((f) => '*' + f), '-d', dir], { stdio: 'ignore' });
  }
  await rm(zip, { force: true });
  if (!FILES.every((f) => existsSync(join(dir, f)))) throw new Error(`Could not find ${FILES.join(', ')} in the downloaded zip`);
}

export async function createFaceModel(dir) {
  const { ort, sharp } = await deps();
  await ensureModels(dir);
  const opts = { executionProviders: ['cpu'], logSeverityLevel: 3 };
  const [det, rec] = await Promise.all(FILES.map((f) => ort.InferenceSession.create(join(dir, f), opts)));
  return { ort, sharp, det, rec };
}

/** Decodes any image to RGB pixels, with phone orientation applied. */
async function rgb(model, input) {
  const { data, info } = await model.sharp(input).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Adds a white border so faces that fill the whole photo (selfies) are still found by the detector. */
function pad(img, ratio) {
  const px = Math.round(img.width * ratio), py = Math.round(img.height * ratio);
  const width = img.width + 2 * px, height = img.height + 2 * py;
  const data = Buffer.alloc(width * height * 3, 255);
  for (let y = 0; y < img.height; y++) img.data.copy(data, ((y + py) * width + px) * 3, y * img.width * 3, (y + 1) * img.width * 3);
  return { img: { data, width, height }, dx: px, dy: py };
}

async function detect(model, img) {
  const scale = Math.min(DET_SIZE / img.width, DET_SIZE / img.height);
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const { data: small } = await model.sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .resize(w, h, { kernel: 'linear' }).raw().toBuffer({ resolveWithObject: true });
  const input = new Float32Array(3 * DET_SIZE * DET_SIZE); // padded bottom/right with zeros, like InsightFace
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, o = y * DET_SIZE + x;
    for (let c = 0; c < 3; c++) input[c * DET_SIZE * DET_SIZE + o] = (small[i + c] - 127.5) / 128;
  }
  const out = await model.det.run({ [model.det.inputNames[0]]: new model.ort.Tensor('float32', input, [1, 3, DET_SIZE, DET_SIZE]) });
  // Outputs per stride (8, 16, 32): scores (1 value per anchor), boxes (4), landmarks (10). Group them by width.
  const tensors = model.det.outputNames.map((n) => out[n]);
  const width = (t) => t.dims[t.dims.length - 1];
  const rows = (t) => t.data.length / width(t);
  const pick = (k) => tensors.filter((t) => width(t) === k).sort((a, b) => rows(b) - rows(a));
  const [scores, boxes, kps] = [pick(1), pick(4), pick(10)];
  if (scores.length !== 3 || boxes.length !== 3 || kps.length !== 3) throw new Error('Unexpected face detector outputs');
  const faces = [];
  [8, 16, 32].forEach((stride, s) => {
    const gw = DET_SIZE / stride, anchors = rows(scores[s]) / ((DET_SIZE / stride) ** 2);
    for (let i = 0; i < rows(scores[s]); i++) {
      const score = scores[s].data[i];
      if (score < DET_THRESHOLD) continue;
      const cell = Math.floor(i / anchors), cx = (cell % gw) * stride, cy = Math.floor(cell / gw) * stride;
      const b = boxes[s].data.subarray(i * 4, i * 4 + 4), k = kps[s].data.subarray(i * 10, i * 10 + 10);
      faces.push({
        score,
        box: [cx - b[0] * stride, cy - b[1] * stride, cx + b[2] * stride, cy + b[3] * stride].map((v) => v / scale),
        landmarks: [0, 1, 2, 3, 4].map((j) => [(cx + k[j * 2] * stride) / scale, (cy + k[j * 2 + 1] * stride) / scale]),
      });
    }
  });
  return nms(faces);
}

function nms(faces) {
  faces.sort((a, b) => b.score - a.score);
  const area = (b) => Math.max(0, b[2] - b[0] + 1) * Math.max(0, b[3] - b[1] + 1);
  const keep = [];
  for (const f of faces) {
    const overlaps = keep.some((k) => {
      const ix = Math.max(0, Math.min(f.box[2], k.box[2]) - Math.max(f.box[0], k.box[0]) + 1);
      const iy = Math.max(0, Math.min(f.box[3], k.box[3]) - Math.max(f.box[1], k.box[1]) + 1);
      return (ix * iy) / (area(f.box) + area(k.box) - ix * iy) > NMS_THRESHOLD;
    });
    if (!overlaps) keep.push(f);
  }
  return keep;
}

/** Least-squares similarity transform (Umeyama) mapping src points onto dst: returns [a, b, tx, ty] for
 *  x' = a·x − b·y + tx, y' = b·x + a·y + ty. */
export function similarity(src, dst) {
  const n = src.length, mean = (p, i) => p.reduce((s, q) => s + q[i], 0) / n;
  const [sx, sy, dx, dy] = [mean(src, 0), mean(src, 1), mean(dst, 0), mean(dst, 1)];
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = [src[i][0] - sx, src[i][1] - sy], [u, v] = [dst[i][0] - dx, dst[i][1] - dy];
    num1 += x * u + y * v; num2 += x * v - y * u; den += x * x + y * y;
  }
  const a = num1 / den, b = num2 / den;
  return [a, b, dx - (a * sx - b * sy), dy - (b * sx + a * sy)];
}

/** Cuts the 112×112 aligned face (bilinear sampling through the inverse transform), as ArcFace expects. */
function align(img, landmarks) {
  const [a, b, tx, ty] = similarity(landmarks, ARCFACE_DST);
  const det = a * a + b * b, out = new Float32Array(3 * 112 * 112);
  for (let y = 0; y < 112; y++) for (let x = 0; x < 112; x++) {
    const u = x - tx, v = y - ty, sx = (a * u + b * v) / det, sy = (-b * u + a * v) / det;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      const px = (xx, yy) => (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height ? 0 : img.data[(yy * img.width + xx) * 3 + c]);
      const val = px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) + px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy;
      out[c * 112 * 112 + y * 112 + x] = (val - 127.5) / 127.5;
    }
  }
  return out;
}

const normalise = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
export const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const average = (vs) => normalise(vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length));

/** Finds the largest face in an image and returns its embedding, or null when there is no face. */
export async function embedFace(model, input) {
  const img = await rgb(model, input);
  let faces = await detect(model, img), base = img;
  for (const ratio of [0.5, 1]) {
    if (faces.length) break;
    const p = pad(img, ratio); base = p.img;
    faces = await detect(model, p.img);
  }
  if (!faces.length) return null;
  const face = faces.reduce((best, f) => ((f.box[2] - f.box[0]) > (best.box[2] - best.box[0]) ? f : best));
  const out = await model.rec.run({ [model.rec.inputNames[0]]: new model.ort.Tensor('float32', align(base, face.landmarks), [1, 3, 112, 112]) });
  return { embedding: normalise(Array.from(out[model.rec.outputNames[0]].data)), faceWidth: Math.round(face.box[2] - face.box[0]), confidence: face.score };
}
