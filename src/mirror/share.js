// Share a look as a picture (Felipe, 2026-11-03): the cut-out on pure white, made in the browser and handed to the
// phone's share sheet (WhatsApp, Messages, AirDrop, Save to Photos…). Nothing is uploaded and no link is made: the
// picture goes only where the person sends it. Where the share sheet can't take files (most desktops), it downloads.
// iPhones only open the share sheet straight from a tap, so the picture is prepared beforehand (prepareLookFile, when
// the look opens full screen) and the tap only shares it.

const FILE_NAME = 'accing-look.jpg';

/** The look on white as a JPEG File. */
export async function prepareLookFile(imageUrl) {
  const res = await fetch(imageUrl, { mode: 'cors' });
  if (!res.ok) throw new Error(`Couldn't load the look (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("Couldn't make the picture"))), 'image/jpeg', 0.92));
  return new File([blob], FILE_NAME, { type: 'image/jpeg' });
}

/** Opens the share sheet with the file, or downloads it. Returns 'shared' | 'saved' | 'cancelled'. */
export async function shareLookFile(file) {
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (the tap was too long ago) and others: fall back to saving it.
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
