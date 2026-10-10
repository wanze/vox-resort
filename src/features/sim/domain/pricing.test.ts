import { describe, expect, it } from 'vitest';
import { priceOf } from '../../catalog/domain/prices';
import {
  bookingPull,
  factorOf,
  fairFactor,
  LIST_PRICES,
  overpriced,
  priceRowsOf,
  pricesView,
  priceVerdict,
  setPrice,
  venuePull,
} from './pricing';

const HOTEL = { id: 'hotel', beds: 40 };
const BUNGALOW = { id: 'bungalow', beds: 4 };

describe('setPrice', () => {
  it('keeps a factor inside the range', () => {
    expect(setPrice(LIST_PRICES, 'villa', 0.2)).toEqual({ villa: 0.5 });
    expect(setPrice(LIST_PRICES, 'villa', 3)).toEqual({ villa: 2 });
  });

  it('rounds to the step, never storing a float that only looks like one', () => {
    expect(setPrice(LIST_PRICES, 'villa', 1.26)).toEqual({ villa: 1.3 });
    expect(setPrice(LIST_PRICES, 'villa', 1 + 0.1)).toEqual({ villa: 1.1 });
    expect(setPrice(LIST_PRICES, 'villa', 1.15)).toEqual({ villa: 1.2 });
  });

  it('drops a family back to list at 1 or at null, and leaves the others alone', () => {
    const set = setPrice(setPrice(LIST_PRICES, 'villa', 1.4), 'hotel', 0.8);
    expect(setPrice(set, 'villa', 1.02)).toEqual({ hotel: 0.8 });
    expect(setPrice(set, 'villa', null)).toEqual({ hotel: 0.8 });
    expect(set).toEqual({ villa: 1.4, hotel: 0.8 });
  });
});

describe('factorOf', () => {
  it("reads a style's factor from its family, and list price for anything unset", () => {
    const prices = setPrice(LIST_PRICES, 'villa', 1.4);
    expect(factorOf(prices, 'villa-b')).toBe(1.4);
    expect(factorOf(prices, 'hotel')).toBe(1);
    expect(factorOf(prices, 'beach')).toBe(1);
  });
});

describe('fairFactor', () => {
  it('is list price at three stars, and more for every star above', () => {
    expect(fairFactor(3)).toBe(1);
    expect(fairFactor(5)).toBeCloseTo(1.3);
    expect(fairFactor(1)).toBeCloseTo(0.7);
  });
});

describe('bookingPull', () => {
  it('is 1 at list price whatever the stars, and with no beds at all', () => {
    for (const stars of [0, 1, 3, 4.5, 5]) {
      expect(bookingPull([HOTEL, BUNGALOW], LIST_PRICES, stars)).toBe(1);
    }
    expect(bookingPull([], { hotel: 2 }, 3)).toBe(1);
  });

  it('lets good stars raise the price up to fair without losing a booking', () => {
    expect(bookingPull([HOTEL], { hotel: 1.1 }, 4)).toBe(1);
    expect(bookingPull([HOTEL], { hotel: 1.3 }, 5)).toBe(1);
    expect(bookingPull([HOTEL], { hotel: 1.1 }, 3)).toBeCloseTo(0.85);
  });

  it('falls as the beds get dearer, inside its bounds', () => {
    const at = (factor: number) => bookingPull([HOTEL], setPrice(LIST_PRICES, 'hotel', factor), 4);
    expect(at(1.5)).toBeCloseTo(0.475);
    expect(at(1.5)).toBeLessThan(at(1.2));
    expect(at(2)).toBe(0.2);
    expect(at(0.5)).toBe(1.3);
    expect(at(0.9)).toBeCloseTo(1.15);
  });

  it('weighs a big hotel over a small bungalow', () => {
    const dearHotel = bookingPull([HOTEL, BUNGALOW], { hotel: 1.5 }, 3);
    const dearBungalow = bookingPull([HOTEL, BUNGALOW], { bungalow: 1.5 }, 3);
    expect(dearHotel).toBeLessThan(dearBungalow);
  });
});

describe('venuePull', () => {
  it('changes nothing at list price, and stays inside its bounds', () => {
    expect(venuePull(1)).toBe(1);
    expect(venuePull(1.5)).toBeCloseTo(0.7);
    expect(venuePull(2)).toBe(0.4);
    expect(venuePull(0.5)).toBeCloseTo(1.25);
  });
});

describe('overpriced', () => {
  it('is a fifth above what the stars justify', () => {
    expect(overpriced(1.2, 3)).toBe(false);
    expect(overpriced(1.3, 3)).toBe(true);
    expect(overpriced(1.5, 5)).toBe(false);
  });
});

describe('priceVerdict', () => {
  it('calls a bed dear past what the stars accept, and never list price', () => {
    expect(priceVerdict({ role: 'lodging', factor: 1 }, 1)).toBe('fair');
    expect(priceVerdict({ role: 'lodging', factor: 1.1 }, 3)).toBe('dear');
    expect(priceVerdict({ role: 'lodging', factor: 1.1 }, 4)).toBe('fair');
    expect(priceVerdict({ role: 'lodging', factor: 0.9 }, 5)).toBe('cheap');
  });

  it('calls a venue dear only where its visitors grumble', () => {
    expect(priceVerdict({ role: 'venue', factor: 1.2 }, 3)).toBe('fair');
    expect(priceVerdict({ role: 'venue', factor: 1.3 }, 3)).toBe('dear');
  });
});

describe('priceRowsOf', () => {
  it('lists each priced family once, lodgings first, and skips what is free', () => {
    const rows = priceRowsOf(['restaurant', 'villa-b', 'villa', 'bungalow', 'tree', 'restrooms'], {
      villa: 1.2,
    });
    expect(rows.map((row) => row.family)).toEqual(['bungalow', 'villa', 'restaurant']);
    expect(rows[1]).toEqual({
      family: 'villa',
      label: 'Villa',
      role: 'lodging',
      sign: null,
      list: priceOf('villa'),
      charged: Math.round(priceOf('villa') * 1.2),
      factor: 1.2,
    });
    expect(rows[2]).toMatchObject({ role: 'venue', sign: 'restaurant', factor: 1 });
  });
});

describe('pricesView', () => {
  it('lists a family once over its placements, and reads the pull at these stars', () => {
    const view = pricesView({
      placements: [{ id: 'villa' }, { id: 'villa-b' }, { id: 'tree' }],
      prices: { villa: 1.6 },
      homes: [{ id: 'villa', beds: 6 }],
      stars: 4,
    });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ family: 'villa', factor: 1.6 });
    expect(view.fair).toBeCloseTo(1.15);
    expect(view.pull).toBeCloseTo(1 - 1.5 * (1.6 - 1.15));
    expect(view.stars).toBe(4);
  });
});
