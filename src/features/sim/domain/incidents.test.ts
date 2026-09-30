import { describe, expect, it } from 'vitest';
import { createGuests } from '../../guests/domain/guests';
import {
  burnTheSunbathers,
  hurt,
  HURT_LEVEL,
  mishap,
  MISHAP_UNWATCHED,
  MISHAP_WATCHED,
  SUNBURN_PER_HOUR,
  sunburnt,
} from './incidents';
import { createNeeds } from './needs';

const DRAWS = 10_000;

const rateOf = (happened: (draw: number) => boolean, draws = DRAWS): number => {
  let count = 0;
  for (let draw = 0; draw < draws; draw++) if (happened(draw)) count++;
  return count / draws;
};

describe('sunburnt', () => {
  it('burns nobody outside a heatwave', () => {
    expect(rateOf((draw) => sunburnt(draw, draw % 24, false, true))).toBe(0);
  });

  it('burns nobody off the sand', () => {
    expect(rateOf((draw) => sunburnt(draw, draw % 24, true, false))).toBe(0);
  });

  it('burns about as many sunbathers an hour as the rate says', () => {
    const byPerson = rateOf((draw) => sunburnt(draw, 14, true, true));
    const byHour = rateOf((draw) => sunburnt(7, 1000 + draw, true, true));
    for (const rate of [byPerson, byHour]) {
      expect(rate).toBeGreaterThan(SUNBURN_PER_HOUR * 0.7);
      expect(rate).toBeLessThan(SUNBURN_PER_HOUR * 1.3);
    }
  });
});

describe('mishap', () => {
  it('happens about as often as the rate says, and ten times less under a lifeguard', () => {
    const draws = 200_000;
    const unwatched = rateOf((draw) => mishap(draw % 997, draw, false), draws);
    const watched = rateOf((draw) => mishap(draw % 997, draw, true), draws);
    expect(unwatched).toBeGreaterThan(MISHAP_UNWATCHED * 0.8);
    expect(unwatched).toBeLessThan(MISHAP_UNWATCHED * 1.2);
    expect(watched).toBeGreaterThan(MISHAP_WATCHED * 0.7);
    expect(watched).toBeLessThan(MISHAP_WATCHED * 1.3);
    expect(unwatched / watched).toBeGreaterThan(7);
    expect(unwatched / watched).toBeLessThan(13);
  });

  it('draws the same incidents for the same person and moment every time', () => {
    const first = Array.from({ length: 2000 }, (_, draw) => mishap(draw, draw * 3, false));
    const again = Array.from({ length: 2000 }, (_, draw) => mishap(draw, draw * 3, false));
    expect(again).toEqual(first);
    expect(first).toContain(true);
    const burns = Array.from({ length: 2000 }, (_, draw) => sunburnt(draw, 12, true, true));
    expect(Array.from({ length: 2000 }, (_, draw) => sunburnt(draw, 12, true, true))).toEqual(
      burns,
    );
    expect(burns, 'a sunburn and a mishap drew the same').not.toEqual(
      Array.from({ length: 2000 }, (_, draw) => mishap(draw, 12, false)),
    );
  });
});

describe('hurt', () => {
  it('drops a guest to hurt, and never raises anybody', () => {
    const guests = createGuests({
      count: 4,
      homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: 4 }],
      variants: 4,
      childVariant: 3,
      seed: 5,
    });
    const needs = createNeeds(guests, 7);
    hurt(needs, 0);
    expect(needs.level.health[0]).toBeCloseTo(HURT_LEVEL);
    needs.level.health[1] = 0.1;
    hurt(needs, 1);
    expect(needs.level.health[1]).toBeCloseTo(0.1);
    hurt(needs, 9);
    expect(needs.level.health[2]).toBe(1);
  });
});

const onSand = (person: number): boolean => person % 2 === 0;

describe('burnTheSunbathers', () => {
  it('burns only guests who are here and on the sand, and each of them once', () => {
    const count = 400;
    const guests = createGuests({
      count,
      homes: [{ key: 'hotel#0', id: 'hotel', label: 'Hotel', beds: count }],
      variants: 4,
      childVariant: 3,
      seed: 5,
    });
    const needs = createNeeds(guests, 7);
    const present = new Uint8Array(count).fill(1);
    present[0] = 0;
    const burnt: number[] = [];
    for (let hour = 0; hour < 48; hour++) {
      burnTheSunbathers(needs, present, onSand, hour, (person) => burnt.push(person));
    }
    expect(burnt.length).toBeGreaterThan(0);
    expect(new Set(burnt).size).toBe(burnt.length);
    expect(burnt.every((person) => person !== 0 && onSand(person))).toBe(true);
    for (const person of burnt) expect(needs.level.health[person]).toBeCloseTo(HURT_LEVEL);
  });
});
