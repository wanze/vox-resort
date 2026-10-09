import { applyFilter, type ColorMatrix } from '../domain/photoFilters';
import type { PhotoPixels } from '../domain/photoPixels';

// The HUD's own face, sized to the photo rather than the screen, so a 2x shot keeps its proportions.
const CAPTION_FONT = 'Jersey HUD';
const CAPTION_SHARE = 0.035;
const CAPTION_MARGIN = 1.2;

export interface PhotoLook {
  readonly matrix: ColorMatrix;
  readonly caption: string | null;
}

async function writeCaption(context: CanvasRenderingContext2D, caption: string): Promise<void> {
  const { width, height } = context.canvas;
  const size = Math.round(Math.max(16, Math.min(width, height) * CAPTION_SHARE));
  const font = `${size}px '${CAPTION_FONT}', sans-serif`;
  // A face not drawn yet is not loaded yet, and canvas text never waits for one.
  await document.fonts.load(font, caption);
  context.font = font;
  context.textBaseline = 'alphabetic';
  context.shadowColor = 'rgba(0, 0, 0, 0.6)';
  context.shadowBlur = size / 4;
  context.fillStyle = '#ffffff';
  context.fillText(caption, size * CAPTION_MARGIN, height - size * CAPTION_MARGIN);
}

export async function encodePhoto(pixels: PhotoPixels, look: PhotoLook): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas to encode the photo with');
  const data = new Uint8ClampedArray(pixels.data);
  applyFilter(data, look.matrix);
  context.putImageData(new ImageData(data, pixels.width, pixels.height), 0, 0);
  if (look.caption) await writeCaption(context, look.caption);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The photo did not encode'))),
      'image/png',
    ),
  );
}

export function savePhoto(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Revoked a moment later: some browsers start the download only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const fileOf = (blob: Blob, name: string): File => new File([blob], name, { type: 'image/png' });

export function canSharePhotos(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  return navigator.canShare({ files: [fileOf(new Blob([], { type: 'image/png' }), 'photo.png')] });
}

const cancelled = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === 'AbortError';

export async function sharePhoto(blob: Blob, name: string, title: string): Promise<void> {
  try {
    await navigator.share({ files: [fileOf(blob, name)], title });
  } catch (cause: unknown) {
    if (!cancelled(cause)) throw cause;
  }
}
