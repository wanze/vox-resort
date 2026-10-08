import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { TICKS_PER_HOUR } from './simNow';

describe('TICKS_PER_HOUR', () => {
  it('makes a day of twenty-four hours', () => {
    expect(TICKS_PER_HOUR * 24).toBe(TICKS_PER_DAY);
  });
});
