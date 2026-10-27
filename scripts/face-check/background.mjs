// Is the background the flat colour the cleaner paints (#F9F9FB by default)? Measures the brightness (0–255) of the
// edges where only background should be: the left and right 8% of the image over its top 70% (above the floor) and
// the top 5% strip. Calibration 2026-10-27: raw model output measured 232–244 (grey, uneven).
import { BACKGROUND, hexToRgb } from '../clean-background.mjs';

const greyOf = (hex) => { const [r, g, b] = hexToRgb(hex); return (r + g + b) / 3; };
export const TOLERANCE = 3;

export function edgeStats(grey, width, height, target = greyOf(BACKGROUND)) {
  const values = [];
  const sideW = Math.max(1, Math.round(width * 0.08)), bodyH = Math.round(height * 0.7), topH = Math.max(1, Math.round(height * 0.05));
  for (let y = 0; y < bodyH; y++) for (let x = 0; x < width; x++) {
    if (y < topH || x < sideW || x >= width - sideW) values.push(grey[y * width + x]);
  }
  values.sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const p5 = values[Math.floor(values.length * 0.05)];
  return { mean, p5, target, white: Math.abs(mean - target) <= TOLERANCE && p5 >= target - 4 * TOLERANCE };
}

export async function backgroundCheck(bytes, background = BACKGROUND) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  return edgeStats(data, info.width, info.height, greyOf(background));
}
