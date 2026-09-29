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
    expect(clampConfig({ streetTrees: true })).toEqual({ ...DEFAULT_CONFIG, streetTrees: true });
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
      gatePlazas: 'yes',
    } as unknown as Partial<ResortConfig>;
    expect(clampConfig(asked)).toEqual(DEFAULT_CONFIG);
  });
});

describe('variety', () => {
  it('mixes the styles unless asked for the classic look, as a save from before it would be', () => {
    expect(clampConfig().variety).toBe('mixed');
    expect(clampConfig({ variety: 'classic' }).variety).toBe('classic');
    expect(clampConfig({ variety: 'gaudy' as ResortConfig['variety'] }).variety).toBe('mixed');
  });
});

describe('beachDensityOf', () => {
  it('follows the district density on auto, and ignores it otherwise', () => {
    expect(beachDensityOf('auto', 0.45)).toBe(0.45);
    expect(beachDensityOf('packed', 0.2)).toBe(1);
    expect(beachDensityOf('quiet', 1)).toBeLessThan(beachDensityOf('busy', 1));
  });
});
