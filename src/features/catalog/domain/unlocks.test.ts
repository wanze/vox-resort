import { describe, expect, it } from 'vitest';
import { createPrestige, prestigeAfterDay, STREAK_DAYS } from '../../sim/domain/prestige';
import { stylesOf } from './objectTypes';
import { familiesUnlockedAt, isUnlocked, starsNeededFor } from './unlocks';

function prestigeAt(stars: number) {
  let prestige = createPrestige();
  for (let day = 0; day < STREAK_DAYS; day++)
    prestige = prestigeAfterDay(prestige, stars, day).prestige;
  return prestige;
}

describe('starsNeededFor', () => {
  it('reads the tier a model declares', () => {
    expect(starsNeededFor('villa')).toBe(4);
    expect(starsNeededFor('massage-tent')).toBe(3.5);
  });

  it('leaves the basics ungated', () => {
    for (const id of ['hotel', 'restrooms', 'restaurant', 'open-air-stage', 'game-hall', 'path']) {
      expect(starsNeededFor(id)).toBeNull();
    }
  });

  it('gives a variant its original’s tier', () => {
    const styles = stylesOf('villa');
    expect(styles.length).toBeGreaterThan(1);
    for (const style of styles) expect(starsNeededFor(style.id)).toBe(4);
  });

  it('answers null for an id the catalogue does not know', () => {
    expect(starsNeededFor('no-such-model')).toBeNull();
  });
});

describe('isUnlocked', () => {
  it('locks a tycoon building until its tier is reached', () => {
    expect(isUnlocked('villa', createPrestige(), 'tycoon')).toBe(false);
    expect(isUnlocked('villa', prestigeAt(3.6), 'tycoon')).toBe(false);
    expect(isUnlocked('villa', prestigeAt(4), 'tycoon')).toBe(true);
    expect(isUnlocked('hotel', createPrestige(), 'tycoon')).toBe(true);
  });

  it('lets a sandbox and a resort with no reputation build anything', () => {
    expect(isUnlocked('villa', createPrestige(), 'sandbox')).toBe(true);
    expect(isUnlocked('villa', null, 'tycoon')).toBe(true);
  });
});

describe('familiesUnlockedAt', () => {
  it('lists each family once', () => {
    expect(familiesUnlockedAt(4)).toEqual(expect.arrayContaining(['villa', 'spa-pavilion']));
    expect(familiesUnlockedAt(4).filter((id) => id === 'villa')).toHaveLength(1);
  });
});
