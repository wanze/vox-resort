import { describe, expect, it } from 'vitest';
import { arrivalsFor, EMPTY_STARS, MAX_ARRIVALS_SHARE, ratingFor } from './rating';

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
    expect(arrivalsFor(rating, 100)).toBeGreaterThan(0);
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

describe('arrivalsFor', () => {
  it('takes nobody at no stars and the whole cap at five', () => {
    const none = ratingFor({ happiness: 0, present: 10, housed: 0, cleanliness: 0 });
    expect(none.stars).toBe(0);
    expect(arrivalsFor(none, 400)).toBe(0);

    const best = ratingFor({ happiness: 1, present: 10, housed: 10 });
    expect(arrivalsFor(best, 400)).toBe(400 * MAX_ARRIVALS_SHARE);
  });

  it('never sends more people than there are beds standing free', () => {
    const best = ratingFor({ happiness: 1, present: 10, housed: 10 });
    for (const beds of [0, 1, 2, 3, 7, 40, 401]) {
      expect(arrivalsFor(best, beds)).toBeLessThanOrEqual(beds);
      expect(arrivalsFor(best, beds)).toBeGreaterThanOrEqual(0);
    }
    expect(arrivalsFor(best, 0)).toBe(0);
    expect(arrivalsFor(best, -5)).toBe(0);
    expect(arrivalsFor(best, 3)).toBe(1);
  });

  it('sends more people the better the resort is rated', () => {
    const stars = [0.5, 1, 2, 3, 4, 5].map((value) =>
      arrivalsFor({ stars: value, happiness: 1, housed: 1, cleanliness: 1 }, 400),
    );
    expect(stars).toEqual([...stars].toSorted((a, b) => a - b));
    expect(stars.at(-1)).toBeGreaterThan(stars[0]!);
  });
});
