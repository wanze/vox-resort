import { describe, expect, it } from 'vitest';
import type { PhotoPixels } from '../../photo/domain/photoPixels';
import { newsprint, newsprintCell, NEWSPRINT_STRENGTH, type Rgb } from './newsprint';

const INK: Rgb = [28, 27, 25];
const PAPER: Rgb = [235, 232, 223];

function image(width: number, height: number, grey: (x: number) => number): PhotoPixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      data.fill(grey(x), at, at + 3);
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}

// 0 for bare paper, 1 for solid ink, read from the red channel.
function inkOf(pixels: PhotoPixels, from = 0, to = pixels.width): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < pixels.height; y++) {
    for (let x = from; x < to; x++) {
      sum += (PAPER[0] - pixels.data[(y * pixels.width + x) * 4]!) / (PAPER[0] - INK[0]);
      count++;
    }
  }
  return sum / count;
}

const CELL = 4;

describe('the newsprint screen', () => {
  it('leaves white almost bare and prints black mostly in ink', () => {
    expect(
      inkOf(
        newsprint(
          image(64, 64, () => 255),
          INK,
          PAPER,
          CELL,
          NEWSPRINT_STRENGTH,
        ),
      ),
    ).toBeLessThan(0.05);
    expect(
      inkOf(
        newsprint(
          image(64, 64, () => 0),
          INK,
          PAPER,
          CELL,
          NEWSPRINT_STRENGTH,
        ),
      ),
    ).toBeGreaterThan(0.7);
  });

  it('puts more ink where the photo is darker', () => {
    const ramp = newsprint(
      image(128, 32, (x) => 255 - x * 2),
      INK,
      PAPER,
      CELL,
      1,
    );
    expect(inkOf(ramp, 64, 128)).toBeGreaterThan(inkOf(ramp, 0, 64));
  });

  it('prints a flat grey as one flat tone with no dots at strength 0', () => {
    const flat = newsprint(
      image(32, 32, () => 128),
      INK,
      PAPER,
      CELL,
      0,
    );
    for (let at = 4; at < flat.data.length; at += 4) expect(flat.data[at]).toBe(flat.data[0]);
  });

  it('screens a flat grey into dots at full strength', () => {
    const dotted = newsprint(
      image(32, 32, () => 128),
      INK,
      PAPER,
      CELL,
      1,
    );
    expect(new Set(dotted.data.filter((_, at) => at % 4 === 0)).size).toBeGreaterThan(2);
  });

  it('keeps the size and makes every pixel opaque', () => {
    const out = newsprint(
      image(30, 20, () => 90),
      INK,
      PAPER,
      CELL,
      NEWSPRINT_STRENGTH,
    );
    expect([out.width, out.height, out.data.length]).toEqual([30, 20, 30 * 20 * 4]);
    expect(out.data.filter((_, at) => at % 4 === 3).every((alpha) => alpha === 255)).toBe(true);
  });

  it('sizes the screen to the picture, but never finer than a few pixels', () => {
    expect(newsprintCell(1_600)).toBeCloseTo(1_600 / 220);
    expect(newsprintCell(300)).toBe(2.6);
  });
});
