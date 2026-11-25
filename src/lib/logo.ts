// The company logo is stored as a small PNG/JPEG data URL so printouts work offline and nothing
// is fetched from another host. The database enforces the same shape (migration 0003).

export const MAX_LOGO_CHARS = 600_000;
const SAFE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

/** True only for a small PNG or JPEG data URL. Anything else is never put into a document. */
export function isSafeLogoDataUrl(value: string | null | undefined): value is string {
  return !!value && value.length <= MAX_LOGO_CHARS && SAFE.test(value);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('LOGO_UNREADABLE')); };
    img.src = url;
  });
}

/** Shrinks an uploaded image to fit 600x240 and returns it as a PNG (JPEG if the PNG is too large). */
export async function resizeLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('LOGO_NOT_AN_IMAGE');
  if (file.size > 8_000_000) throw new Error('LOGO_TOO_LARGE');
  const img = await loadImage(file);
  const w0 = img.naturalWidth || 600;
  const h0 = img.naturalHeight || 240;
  for (const scale of [1, 0.75, 0.5, 0.35]) {
    const ratio = Math.min(600 / w0, 240 / h0, 1) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * ratio));
    canvas.height = Math.max(1, Math.round(h0 * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('LOGO_UNREADABLE');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (isSafeLogoDataUrl(png)) return png;
    const jpg = canvas.toDataURL('image/jpeg', 0.85);
    if (isSafeLogoDataUrl(jpg)) return jpg;
  }
  throw new Error('LOGO_TOO_LARGE');
}
