import { describe, expect, it } from 'vitest';
import {
  beachDensityOf,
  clampConfig,
  DEFAULT_CONFIG,
  PARK_SHARE,
  VILLA_SHARE,
  type ResortConfig,
} from './resortConfig';

describe('clampConfig', () => {
  it('fills everything not asked for with the defaults', () => {
    expect(clampConfig()).toEqual(DEFAULT_CONFIG);
    expect(clampConfig({ beach: 'packed' })).toEqual({ ...DEFAULT_CONFIG, beach: 'packed' });
  });

  it('pulls the shares into range', () => {
    expect(clampConfig({ parkShare: 3, villaShare: -1 })).toMatchObject({
      parkShare: PARK_SHARE.max,
      villaShare: VILLA_SHARE.min,
    });
  });

  it('falls back to the default for a value it does not know', () => {
    const asked = {
      housing: 'terraces',
      beach: 'crowded',
      parkShare: Number.NaN,
    } as unknown as Partial<ResortConfig>;
    expect(clampConfig(asked)).toEqual(DEFAULT_CONFIG);
  });
});

describe('beachDensityOf', () => {
  it('follows the district density on auto, and ignores it otherwise', () => {
    expect(beachDensityOf('auto', 0.45)).toBe(0.45);
    expect(beachDensityOf('packed', 0.2)).toBe(1);
    expect(beachDensityOf('quiet', 1)).toBeLessThan(beachDensityOf('busy', 1));
  });
});
