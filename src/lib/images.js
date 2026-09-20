// images.js
// Client-side handling for attached images: what's allowed, how big it
// should be before it leaves the device, and where it lands in the bucket.
//
// The pure parts are separated from the canvas work so scripts/test-images.mjs
// can exercise the rules under `node --test`; only downscale() needs a browser.

// Mirrors the contentType pattern in storage.rules. Both lists have to
// agree or an upload passes the form and is then rejected by the bucket.
export const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
];

// Matches the ceiling in storage.rules. The client downscales first, so
// hitting this means an unusual original rather than a normal photo.
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PER_ITEM = 4;

// A modern phone photo is 12MP and several megabytes. Nobody reading a
// family forum needs that, and it costs upload time on mobile data and
// storage forever, so it's resized before it leaves the device. 2000px on
// the long edge still looks sharp full-screen on a laptop.
export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.85;

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Why a file can't be attached, or null when it can. Returns a sentence
// meant to be shown to the person, not a code.
export function rejectionReason(file) {
  if (!file) return 'No file.';
  if (!ALLOWED_TYPES.includes(file.type)) {
    return file.type?.startsWith('image/')
      ? `${file.type.replace('image/', '').toUpperCase()} images aren't supported.`
      : 'Only images can be attached.';
  }
  if (file.size > MAX_BYTES) {
    return `That image is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_BYTES)}.`;
  }
  return null;
}

// Fit-inside scaling that never enlarges: a small image is left alone
// rather than blown up to the cap.
export function scaledSize(width, height, maxEdge = MAX_EDGE) {
  if (!width || !height) return { width: 0, height: 0, scaled: false };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio), scaled: true };
}

// Strips directories and anything that could confuse a storage path, and
// keeps the name short. The uploaded name is cosmetic -- the real
// uniqueness comes from the random prefix in storagePath().
export function safeFileName(name) {
  const base = (name || 'image').split(/[\\/]/).pop();
  const cleaned = base
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(-60);
  return cleaned || 'image';
}

// Everything a user uploads lives under their own uid, because
// storage.rules makes ownership the path rather than a field that could be
// spoofed. The random prefix means two photos called IMG_0001.jpg never
// collide.
export function storagePath(uid, fileName, random = () => Math.random().toString(36).slice(2, 10)) {
  return `attachments/${uid}/${random()}-${safeFileName(fileName)}`;
}

// Browser only: decode, resize if needed, and re-encode. Animated GIFs are
// passed through untouched, since drawing one to a canvas would flatten it
// to a single frame.
export async function downscale(file) {
  if (typeof document === 'undefined') return file;
  if (file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const { width, height, scaled } = scaledSize(bitmap.width, bitmap.height);
  if (!scaled) {
    bitmap.close?.();
    return Object.assign(file, { _width: bitmap.width, _height: bitmap.height });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return file;

  // Re-encoding to JPEG can come out larger than a well-compressed PNG
  // original; keep whichever is actually smaller.
  if (blob.size >= file.size) return file;

  const renamed = new File([blob], safeFileName(file.name).replace(/\.\w+$/, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
  return Object.assign(renamed, { _width: width, _height: height });
}

// Reads intrinsic dimensions so the rendered grid can reserve the right
// space and avoid the layout jumping as images load.
export async function dimensionsOf(file) {
  if (file._width && file._height) return { width: file._width, height: file._height };
  if (typeof createImageBitmap === 'undefined') return { width: 0, height: 0 };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { width: 0, height: 0 };
  const out = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return out;
}
