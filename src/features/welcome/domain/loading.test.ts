import { describe, expect, it } from 'vitest';
import { loadedShare, stepUnderway } from './loading';

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
