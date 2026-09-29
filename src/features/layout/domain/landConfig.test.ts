import { describe, expect, it } from 'vitest';
import { clampLand, DEFAULT_LAND } from './landConfig';

describe('clampLand', () => {
  it('fills in whatever was not asked for', () => {
    expect(clampLand()).toEqual(DEFAULT_LAND);
    expect(clampLand({ island: true })).toEqual({ ...DEFAULT_LAND, island: true });
  });

  it('ignores a value that is not a flag, as a save from elsewhere might carry', () => {
    expect(clampLand({ river: 'yes' as unknown as boolean })).toEqual(DEFAULT_LAND);
  });
});
