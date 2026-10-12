import type { ColorMatrix } from '../../photo/domain/photoFilters';
import type { PhotoPixels, PhotoSize } from '../../photo/domain/photoPixels';
import { encodePhoto } from '../../photo/adapters/photoFile';
import { newsprint, newsprintCell, NEWSPRINT_STRENGTH, type Rgb } from '../domain/newsprint';

// Measured on the cropped vox-resort.png: about 225 KB a photo, so fifty seasons stay near 10 MB.
const STORED: PhotoSize = { width: 1_200, height: 800 };
const STORED_QUALITY = 0.75;

const WIDEST_PRINT = 1_600;

const fitWithin = (size: PhotoSize, box: PhotoSize): PhotoSize => {
  const scale = Math.min(1, box.width / size.width, box.height / size.height);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
};

function canvasOf(size: PhotoSize): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas for the newspaper photo');
  return context;
}

async function pixelsFrom(source: ImageBitmapSource, size: PhotoSize): Promise<PhotoPixels> {
  const bitmap = await createImageBitmap(source, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: 'high',
  });
  try {
    const context = canvasOf(size);
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, size.width, size.height);
    return { width: size.width, height: size.height, data };
  } finally {
    bitmap.close();
  }
}

async function scaled(pixels: PhotoPixels, box: PhotoSize): Promise<PhotoPixels> {
  const size = fitWithin(pixels, box);
  if (size.width === pixels.width && size.height === pixels.height) return pixels;
  const data = new Uint8ClampedArray(pixels.data);
  return pixelsFrom(new ImageData(data, pixels.width, pixels.height), size);
}

// In colour and without a caption: the masthead names the resort, and the print is made later.
export async function frontPhotoBlob(pixels: PhotoPixels, matrix: ColorMatrix): Promise<Blob> {
  const small = await scaled(pixels, STORED);
  return encodePhoto(
    small,
    { matrix, caption: null },
    { type: 'image/jpeg', quality: STORED_QUALITY },
  );
}

async function sizeOf(blob: Blob): Promise<PhotoSize> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

// Any CSS colour the token holds, as the canvas reads it back: always #rrggbb when opaque.
function tokenRgb(name: string): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const context = canvasOf({ width: 1, height: 1 });
  context.fillStyle = value;
  const hex = Number.parseInt(String(context.fillStyle).slice(1), 16);
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function blobOf(pixels: PhotoPixels): Promise<Blob> {
  const context = canvasOf(pixels);
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width), 0, 0);
  return new Promise((resolve, reject) =>
    context.canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The newsprint did not encode'))),
      'image/png',
    ),
  );
}

// Printed afresh each time from the stored colour photo, so a new screen reprints every edition.
export async function newsprintUrl(photo: Blob, shownWidth: number): Promise<string> {
  const stored = await sizeOf(photo);
  const width = Math.min(WIDEST_PRINT, Math.round(shownWidth * devicePixelRatio), stored.width);
  const size = fitWithin(stored, { width, height: Number.MAX_SAFE_INTEGER });
  const pixels = await pixelsFrom(photo, size);
  const ink = tokenRgb('--ink');
  const paper = tokenRgb('--paper');
  const printed = newsprint(pixels, ink, paper, newsprintCell(size.width), NEWSPRINT_STRENGTH);
  return URL.createObjectURL(await blobOf(printed));
}
