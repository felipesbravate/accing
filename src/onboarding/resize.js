// Browser-only: turns a camera frame or a picked photo into a JPEG of at most 2048 px on the long side (the pipeline
// works at that size; phones shoot 4000+ px and 5–10 MB, over Vercel's 4.5 MB request limit).
export const MAX_SIDE = 2048;

/** Scale that fits w×h into MAX_SIDE, never enlarging. Pure (tested). */
export function fitScale(w, h, max = MAX_SIDE) {
  return Math.min(1, max / Math.max(w, h, 1));
}

async function toJpeg(source, w, h) {
  const s = fitScale(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.9));
}

/** A picked file (any image the browser can open; the EXIF rotation is applied). */
export async function fileToJpeg(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (bmp) { try { return await toJpeg(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); } }
  const url = URL.createObjectURL(file); // older Safari: no createImageBitmap options
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('This photo can’t be opened. Try a JPEG or take a new one.')); i.src = url; });
    return await toJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

/** The current frame of a playing <video> (unmirrored, as the camera sees it). */
export function frameToJpeg(video) {
  return toJpeg(video, video.videoWidth, video.videoHeight);
}
