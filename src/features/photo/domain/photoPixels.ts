export interface PhotoPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface PhotoSize {
  readonly width: number;
  readonly height: number;
}

// At 2x a 2880x1626 screen the multisampled buffer alone would be several hundred MB.
export const MAX_PHOTO_SIDE = 4096;

const BYTES_PER_PIXEL = 4;

export function photoSize(buffer: PhotoSize, scale: number, maxSide: number): PhotoSize {
  const fit = Math.min(scale, maxSide / Math.max(buffer.width, buffer.height));
  // The epsilon keeps 2880 * (4096 / 2880) from flooring to 4095.
  const side = (length: number): number => Math.max(1, Math.floor(length * fit + 1e-6));
  return { width: side(buffer.width), height: side(buffer.height) };
}

// WebGPU pads every row but the last to 256 bytes, so the stride is worked out from the length.
function strideOf(length: number, width: number, height: number): number {
  const row = width * BYTES_PER_PIXEL;
  if (height === 1) {
    if (length !== row) throw new Error(`A ${width}x1 read cannot be ${length} bytes`);
    return row;
  }
  const stride = (length - row) / (height - 1);
  if (!Number.isInteger(stride) || stride < row) {
    throw new Error(`A ${width}x${height} read cannot be ${length} bytes`);
  }
  return stride;
}

export function tightRows(
  bytes: ArrayLike<number>,
  width: number,
  height: number,
  bottomUp: boolean,
): Uint8ClampedArray {
  const stride = strideOf(bytes.length, width, height);
  const row = width * BYTES_PER_PIXEL;
  const tight = new Uint8ClampedArray(row * height);
  for (let y = 0; y < height; y++) {
    const from = (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < row; x++) tight[y * row + x] = bytes[from + x]!;
  }
  return tight;
}
