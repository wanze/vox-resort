import { describe, expect, it } from 'vitest';
import { loadedShare, loadingLine, stepUnderway } from './loading';

describe('loadedShare', () => {
  it('runs from nothing to everything', () => {
    expect(loadedShare([])).toBe(0);
    expect(loadedShare(['models', 'resort', 'scene'])).toBe(1);
  });

  it('counts a step once however often it is reported', () => {
    expect(loadedShare(['resort', 'resort'])).toBeCloseTo(1 / 3);
  });
});

describe('stepUnderway', () => {
  it('names the first step not yet done, whichever finished first', () => {
    expect(stepUnderway([])).toBe('models');
    expect(stepUnderway(['resort'])).toBe('models');
    expect(stepUnderway(['models', 'resort'])).toBe('scene');
  });

  it('is null once everything is loaded', () => {
    expect(stepUnderway(['scene', 'models', 'resort'])).toBeNull();
  });
});

describe('loadingLine', () => {
  it('opens on the plain name of the step', () => {
    expect(loadingLine('models', 0)).toBe('Carving the voxel models');
    expect(loadingLine('scene', 0)).toBe('Lighting the scene');
  });

  it('moves on each turn and comes back round', () => {
    const lines = Array.from({ length: 40 }, (_, turn) => loadingLine('resort', turn));
    const distinct = new Set(lines).size;
    expect(distinct).toBeGreaterThan(2);
    expect(lines[distinct]).toBe(lines[0]);
    expect(lines[1]).not.toBe(lines[0]);
  });
});
