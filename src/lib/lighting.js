// Live light check on the face camera, before the photo is taken (Felipe, 2026-11-06). Pure; tested in
// tests/lighting.test.js. The phone's camera brightens dark scenes on its own before the page sees them, so this only
// catches what survives that: a clearly dark face, or a bright window or lamp behind the person. The photo check after
// the shot (photo-advice.js, well_lit) still catches the rest.

/** Mean brightness (0–1, Rec. 601 luma) of the face area (the middle of the frame, where the oval is) and of the rest.
 *  rgba: the pixels of a small w×h copy of the camera image. */
export function lightLevels(rgba, w, h) {
  let face = 0, nFace = 0, around = 0, nAround = 0;
  const cx = w / 2, cy = h / 2, rx = w * 0.28, ry = h * 0.3;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const l = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) { face += l; nFace += 1; } else { around += l; nAround += 1; }
    }
  }
  return { face: nFace ? face / nFace : 0, around: nAround ? around / nAround : 0 };
}

export const TOO_DARK = 0.22;   // face brightness below this: too dark
export const BACKLIT_GAP = 0.25; // the rest of the frame this much brighter than the face: light behind the person

/** What to say about the light, or null when it's fine. */
export function lightingAdvice({ face, around }) {
  if (face < TOO_DARK) return { key: 'dark', title: 'It’s too dark here.', hint: 'Face a window or a lamp so the light falls on your face.' };
  if (around - face > BACKLIT_GAP && face < 0.5) return { key: 'backlit', title: 'The light is behind you', hint: 'Turn so the window or lamp is in front of you, not behind.' };
  return null;
}
