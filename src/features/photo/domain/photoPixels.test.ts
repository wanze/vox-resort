import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_SIDE, photoSize, tightRows } from './photoPixels';

// Each pixel's bytes are its row and column, so a misread shows which one it took.
function padded(width: number, height: number, stride: number): Uint8Array {
  const bytes = new Uint8Array(stride * (height - 1) + width * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) bytes.set([y, x, 7, 255], y * stride + x * 4);
  }
  return bytes;
}

const rowsOf = (data: Uint8ClampedArray, width: number): number[] =>
  Array.from({ length: data.length / (width * 4) }, (_unused, y) => data[y * width * 4]!);

describe('tightRows', () => {
  it('drops the padding of 256-byte rows, the last row unpadded', () => {
    const tight = tightRows(padded(3, 2, 256), 3, 2, false);
    expect(tight).toHaveLength(3 * 2 * 4);
    expect(Array.from(tight.slice(12, 16))).toEqual([1, 0, 7, 255]);
    expect(Array.from(tight.slice(20, 24))).toEqual([1, 2, 7, 255]);
  });

  it('flips a bottom-up read', () => {
    const tight = tightRows(padded(3, 4, 12), 3, 4, true);
    expect(rowsOf(tight, 3)).toEqual([3, 2, 1, 0]);
  });

  it('reads a single row', () => {
    expect(Array.from(tightRows(padded(2, 1, 8), 2, 1, false))).toEqual([
      0, 0, 7, 255, 0, 1, 7, 255,
    ]);
  });

  it('refuses a length no stride explains', () => {
    expect(() => tightRows(new Uint8Array(31), 3, 3, false)).toThrow();
    expect(() => tightRows(new Uint8Array(13), 3, 1, false)).toThrow();
    expect(() => tightRows(new Uint8Array(20), 3, 2, false)).toThrow();
  });
});

describe('photoSize', () => {
  it('is the buffer at 1x', () => {
    expect(photoSize({ width: 1600, height: 900 }, 1, MAX_PHOTO_SIDE)).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it('doubles it at 2x', () => {
    expect(photoSize({ width: 1600, height: 900 }, 2, MAX_PHOTO_SIDE)).toEqual({
      width: 3200,
      height: 1800,
    });
  });

  it('caps the long side and keeps the aspect', () => {
    const size = photoSize({ width: 2880, height: 1626 }, 2, MAX_PHOTO_SIDE);
    expect(size.width).toBe(4096);
    expect(size.height).toBe(Math.floor(1626 * (4096 / 2880)));
  });
});
