import { describe, expect, it } from 'vitest';
import { applyFilter, PHOTO_FILTER_IDS, PHOTO_FILTERS, svgValuesOf } from './photoFilters';

const pixels = (): Uint8ClampedArray =>
  Uint8ClampedArray.from([10, 120, 240, 255, 255, 255, 255, 128, 0, 0, 0, 7, 200, 40, 90, 255]);

describe('applyFilter', () => {
  it('leaves the bytes alone for no filter', () => {
    const data = pixels();
    applyFilter(data, PHOTO_FILTERS.none.matrix);
    expect(data).toEqual(pixels());
  });

  it('gives every channel the same value in black and white', () => {
    const data = pixels();
    applyFilter(data, PHOTO_FILTERS.mono.matrix);
    for (let at = 0; at < data.length; at += 4) {
      expect(data[at + 1]).toBe(data[at]);
      expect(data[at + 2]).toBe(data[at]);
    }
  });

  it('never changes alpha', () => {
    for (const id of PHOTO_FILTER_IDS) {
      const data = pixels();
      applyFilter(data, PHOTO_FILTERS[id].matrix);
      for (let at = 3; at < data.length; at += 4) expect(data[at], id).toBe(pixels()[at]);
    }
  });

  it('clamps at 0 and 255', () => {
    const white = Uint8ClampedArray.from([255, 255, 255, 255]);
    applyFilter(white, PHOTO_FILTERS.warm.matrix);
    expect(white[0]).toBe(255);
    const pulled = Uint8ClampedArray.from([100, 100, 100, 255]);
    applyFilter(pulled, [-1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(pulled[0]).toBe(0);
  });

  it('lifts the blacks when faded', () => {
    const black = Uint8ClampedArray.from([0, 0, 0, 255]);
    applyFilter(black, PHOTO_FILTERS.faded.matrix);
    expect(black[0]).toBeGreaterThan(0);
  });
});

describe('svgValuesOf', () => {
  it('writes the twenty numbers feColorMatrix takes', () => {
    for (const id of PHOTO_FILTER_IDS) {
      const values = svgValuesOf(PHOTO_FILTERS[id].matrix).split(' ').map(Number);
      expect(values, id).toHaveLength(20);
      expect(values.every(Number.isFinite)).toBe(true);
    }
  });
});
