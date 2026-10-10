import { describe, expect, it } from 'vitest';
import { shownDay } from './dayNumber';

describe('shownDay', () => {
  it('calls the game’s first day day 1', () => {
    expect(shownDay(0)).toBe(1);
    expect(shownDay(88)).toBe(89);
  });
});
