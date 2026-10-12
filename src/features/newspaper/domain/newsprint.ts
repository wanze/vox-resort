import type { PhotoPixels } from '../../photo/domain/photoPixels';

export type Rgb = readonly [number, number, number];

// The maintainer's pick on the draft's Dots slider: a full screen hid the resort.
export const NEWSPRINT_STRENGTH = 0.35;

// Paper never takes all of the ink, so the blackest shadow still reads as print.
const INK_COVER = 0.9;

const MIN_CELL = 2.6;

const CELLS_ACROSS = 220;

export const newsprintCell = (width: number): number => Math.max(MIN_CELL, width / CELLS_ACROSS);

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

// The photo in ink on paper, with a 45° dot screen mixed over it: 0 is plain mono, 1 dots only.
export function newsprint(
  pixels: PhotoPixels,
  ink: Rgb,
  paper: Rgb,
  cell: number,
  strength: number,
): PhotoPixels {
  const { width, height, data } = pixels;
  const out = new Uint8ClampedArray(data.length);
  const turn = Math.SQRT1_2 / cell;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const luma = (0.2126 * data[at]! + 0.7152 * data[at + 1]! + 0.0722 * data[at + 2]!) / 255;
      // A mild contrast lift, so the mid-tones of a sunny resort do not print as one grey.
      const light = clamp((luma - 0.5) * 1.12 + 0.53);
      const u = (x + y) * turn;
      const v = (y - x) * turn;
      const distance = Math.hypot(u - Math.round(u), v - Math.round(v));
      const radius = 0.62 * Math.sqrt(1 - light);
      const dot = clamp((radius - distance) * cell + 0.5);
      const dark = ((1 - light) * (1 - strength) + dot * strength) * INK_COVER;
      out[at] = paper[0] + (ink[0] - paper[0]) * dark;
      out[at + 1] = paper[1] + (ink[1] - paper[1]) * dark;
      out[at + 2] = paper[2] + (ink[2] - paper[2]) * dark;
      out[at + 3] = 255;
    }
  }
  return { width, height, data: out };
}
