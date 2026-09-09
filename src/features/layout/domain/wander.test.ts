import { describe, expect, it } from 'vitest';
import { meanderAt } from './wander';

/** The meander sampled across a plot's worth of columns. */
const across = (seed: number, salt: number, amplitude: number, step = 1): number[] => {
  const line: number[] = [];
  for (let at = 0; at < 120; at += step) line.push(meanderAt(seed, salt, at, amplitude));
  return line;
};

describe('meanderAt', () => {
  it('is straight when it has no amplitude to stray by', () => {
    expect(across(1, 1, 0)).toEqual(Array.from({ length: 120 }, () => 0));
    expect(across(1, 1, -2)).toEqual(Array.from({ length: 120 }, () => 0));
  });

  it('stays inside the amplitude it was given', () => {
    for (const value of across(3, 1, 2.5, 0.25)) {
      expect(Math.abs(value)).toBeLessThanOrEqual(2.5);
    }
  });

  it('gives the same line for the same seed and salt', () => {
    expect(across(12, 5, 3)).toEqual(across(12, 5, 3));
  });

  it('gives a different line to a neighbouring seed', () => {
    // The phases are scattered off the seed rather than scaled by it, so seed 7
    // and seed 8 are not near-identical coastlines that round to the same tiles.
    const seven = across(7, 1, 3).map(Math.round);
    const eight = across(8, 1, 3).map(Math.round);
    expect(seven).not.toEqual(eight);
  });

  it('gives a different line to another salt on the same seed', () => {
    // This is what keeps a terrace step from wandering in step with the coast
    // it is measured off.
    expect(across(4, 1, 3)).not.toEqual(across(4, 3, 3));
  });

  it('is continuous, so neighbouring columns agree at the boundary they share', () => {
    let biggest = 0;
    let previous = meanderAt(5, 1, 0, 3);
    for (let at = 0.05; at < 120; at += 0.05) {
      const here = meanderAt(5, 1, at, 3);
      biggest = Math.max(biggest, Math.abs(here - previous));
      previous = here;
    }
    expect(biggest).toBeLessThan(0.05);
  });

  it('does not repeat within a plot', () => {
    // Two sines at wavelengths that do not divide each other: the line at the
    // far side of a 120-tile plot is not the line at the near side.
    const line = across(2, 1, 3);
    const near = line.slice(0, 40).map(Math.round);
    const far = line.slice(80).map(Math.round);
    expect(near).not.toEqual(far);
  });
});
