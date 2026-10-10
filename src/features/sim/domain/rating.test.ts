import { describe, expect, it } from 'vitest';
import {
  arrivalsFor,
  ARRIVALS_SHARE,
  costliestPart,
  EMPTY_STARS,
  RATING_PARTS,
  ratingFor,
  starsLost,
} from './rating';

describe('ratingFor', () => {
  it('gives five stars to a resort that is happy and housed', () => {
    const rating = ratingFor({ happiness: 1, present: 600, housed: 600, cleanliness: 1 });
    expect(rating).toEqual({ stars: 5, happiness: 1, housed: 1, cleanliness: 1 });
    expect(ratingFor({ happiness: 1, present: 600, housed: 600 })).toEqual(rating);
  });

  it('gives a miserable resort next to nothing', () => {
    const rating = ratingFor({ happiness: 0, present: 600, housed: 0, cleanliness: 0 });
    expect(rating.stars).toBe(0);
    expect(ratingFor({ happiness: 0, present: 600, housed: 600 }).stars).toBeLessThan(2);
    const homeless = ratingFor({ happiness: 1, present: 600, housed: 0 });
    expect(homeless.stars).toBeLessThan(5);
    expect(homeless.stars).toBeGreaterThan(3);
  });

  it('gives an empty resort the benefit of the doubt', () => {
    const rating = ratingFor({ happiness: null, present: 0, housed: 0 });
    expect(rating.stars).toBe(EMPTY_STARS);
    expect(rating.happiness).toBe(0);
    expect(rating.housed).toBe(0);
    expect(rating.cleanliness).toBe(1);
    expect(ratingFor({ happiness: null, present: 0, housed: 0, cleanliness: 0.4 }).stars).toBe(
      EMPTY_STARS,
    );
    expect(arrivalsFor(rating, { free: 100, total: 100 })).toBeGreaterThan(0);
  });

  it('keeps all three terms on the way out, and every one inside 0..1', () => {
    const rating = ratingFor({ happiness: 1.4, present: 10, housed: 40, cleanliness: 2 });
    expect(rating.happiness).toBe(1);
    expect(rating.housed).toBe(1);
    expect(rating.cleanliness).toBe(1);
    expect(ratingFor({ happiness: -3, present: 10, housed: 4, cleanliness: -1 })).toEqual({
      stars: 0.4,
      happiness: 0,
      housed: 0.4,
      cleanliness: 0,
    });
  });

  it('rates a filthy resort below an identical clean one', () => {
    const shared = { happiness: 0.8, present: 600, housed: 500 } as const;
    const clean = ratingFor({ ...shared, cleanliness: 1 });
    const filthy = ratingFor({ ...shared, cleanliness: 0 });
    expect(filthy.stars).toBeLessThan(clean.stars);
    const unhappy = ratingFor({ ...shared, happiness: 0, cleanliness: 1 });
    expect(clean.stars - filthy.stars).toBeLessThan(clean.stars - unhappy.stars);
  });

  it('rounds the stars to the one decimal place the HUD shows', () => {
    const { stars } = ratingFor({ happiness: 0.4321, present: 3, housed: 1 });
    expect(stars).toBe(Math.round(stars * 10) / 10);
    expect(stars).toBeGreaterThan(0);
    expect(stars).toBeLessThan(5);
  });
});

describe('starsLost', () => {
  it('finds nothing lost in a perfect resort', () => {
    const rating = ratingFor({ happiness: 1, present: 600, housed: 600, cleanliness: 1 });
    for (const part of RATING_PARTS) expect(starsLost(rating, part)).toBe(0);
    expect(costliestPart(rating)).toBeNull();
  });

  it('charges half the happiness at its share of five stars', () => {
    const rating = ratingFor({ happiness: 0.5, present: 600, housed: 600, cleanliness: 1 });
    expect(starsLost(rating, 'happiness')).toBe(1.8);
    expect(costliestPart(rating)).toBe('happiness');
  });

  it('names the part losing most, even when it is not happiness', () => {
    const rating = ratingFor({ happiness: 0.9, present: 600, housed: 0, cleanliness: 1 });
    expect(starsLost(rating, 'housed')).toBeGreaterThan(starsLost(rating, 'happiness'));
    expect(costliestPart(rating)).toBe('housed');
  });

  it('adds up to the stars missing from five, give or take the rounding', () => {
    const rating = ratingFor({ happiness: 0.63, present: 600, housed: 410, cleanliness: 0.37 });
    const lost = RATING_PARTS.reduce((sum, part) => sum + starsLost(rating, part), 0);
    expect(Math.abs(lost - (5 - rating.stars))).toBeLessThanOrEqual(0.15);
  });
});

const empty = (beds: number) => ({ free: beds, total: beds });

// Stays average eight and a half nights, so that share leaves each night.
const occupancyAt = (stars: number): number => {
  const total = 400;
  let taken = 0;
  for (let night = 0; night < 200; night++) {
    taken -= taken / 8.5;
    const rating = { stars, happiness: 1, housed: 1, cleanliness: 1 };
    taken += arrivalsFor(rating, { free: total - taken, total });
  }
  return taken / total;
};

describe('arrivalsFor', () => {
  it('takes nobody at one star and the whole share of the beds at five', () => {
    const none = ratingFor({ happiness: 0, present: 10, housed: 0, cleanliness: 0 });
    expect(none.stars).toBe(0);
    expect(arrivalsFor(none, empty(400))).toBe(0);
    expect(arrivalsFor({ ...none, stars: 1 }, empty(400))).toBe(0);

    const best = ratingFor({ happiness: 1, present: 10, housed: 10 });
    expect(arrivalsFor(best, empty(400))).toBe(400 * ARRIVALS_SHARE);
  });

  it('books as many people into a nearly full resort as into an empty one', () => {
    const good = ratingFor({ happiness: 0.8, present: 10, housed: 10 });
    expect(arrivalsFor(good, { free: 100, total: 400 })).toBe(arrivalsFor(good, empty(400)));
  });

  it('fills a five-star resort and keeps a three-star one about two thirds full', () => {
    expect(occupancyAt(5)).toBeGreaterThan(0.95);
    expect(occupancyAt(3)).toBeGreaterThan(0.55);
    expect(occupancyAt(3)).toBeLessThan(0.75);
  });

  it('never sends more people than there are beds standing free', () => {
    const best = ratingFor({ happiness: 1, present: 10, housed: 10 });
    for (const free of [0, 1, 2, 3, 7, 40, 401]) {
      expect(arrivalsFor(best, { free, total: 401 })).toBeLessThanOrEqual(free);
      expect(arrivalsFor(best, { free, total: 401 })).toBeGreaterThanOrEqual(0);
    }
    expect(arrivalsFor(best, empty(0))).toBe(0);
    expect(arrivalsFor(best, { free: -5, total: 10 })).toBe(0);
    expect(arrivalsFor(best, empty(3))).toBe(1);
  });

  it('sends more people the better the resort is rated', () => {
    const stars = [0.5, 1, 2, 3, 4, 5].map((value) =>
      arrivalsFor({ stars: value, happiness: 1, housed: 1, cleanliness: 1 }, empty(400)),
    );
    expect(stars).toEqual([...stars].toSorted((a, b) => a - b));
    expect(stars.at(-1)).toBeGreaterThan(stars[0]!);
  });

  it('books half as many at half the pull, and none past the beds free at more', () => {
    const good = ratingFor({ happiness: 0.8, present: 10, housed: 10 });
    expect(arrivalsFor(good, empty(400), 1)).toBe(arrivalsFor(good, empty(400)));
    expect(arrivalsFor(good, empty(400), 0.5)).toBeCloseTo(arrivalsFor(good, empty(400)) / 2, -1);
    expect(arrivalsFor(good, empty(400), 0)).toBe(0);
  });

  it('books more at a pull above 1, still within the beds free', () => {
    const good = ratingFor({ happiness: 0.8, present: 10, housed: 10 });
    expect(arrivalsFor(good, empty(400), 1.3)).toBeGreaterThan(arrivalsFor(good, empty(400)));
    expect(arrivalsFor(good, { free: 20, total: 400 }, 1.3)).toBe(20);
  });
});
