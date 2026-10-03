import { describe, expect, it } from 'vitest';
import { createRandom } from '../../layout/domain/random';
import { gapSeconds, moodAt, moodChange, nextTrack } from './playlist';

describe('moodAt', () => {
  it('plays the menu on the welcome screen, then day or night music', () => {
    expect(moodAt(1, true)).toBe('menu');
    expect(moodAt(0, false)).toBe('day');
    expect(moodAt(0.5, false)).toBe('day');
    expect(moodAt(0.9, false)).toBe('night');
  });
});

describe('nextTrack', () => {
  it('shuffles without playing a track twice in a row', () => {
    const random = createRandom(3);
    let last = -1;
    const seen = new Set<number>();
    for (let track = 0; track < 100; track++) {
      const next = nextTrack(3, last, random);
      expect(next).not.toBe(last);
      seen.add(next);
      last = next;
    }
    expect(seen.size).toBe(3);
  });
});

describe('gapSeconds', () => {
  it('leaves eight to twenty-five seconds between tracks', () => {
    expect(gapSeconds(() => 0)).toBe(8);
    expect(gapSeconds(() => 0.999)).toBeLessThanOrEqual(25);
  });
});

describe('moodChange', () => {
  it('waits for the end of a track, except leaving the menu, which fades', () => {
    expect(moodChange(null, 'day')).toBe('start');
    expect(moodChange('day', 'day')).toBe('keep');
    expect(moodChange('day', 'night')).toBe('keep');
    expect(moodChange('menu', 'day')).toBe('fade');
  });
});
