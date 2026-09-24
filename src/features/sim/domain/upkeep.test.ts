import { describe, expect, it } from 'vitest';
import {
  carryUpkeep,
  cleanliness,
  createUpkeep,
  dirtiest,
  NEEDS_CLEANING,
  scrub,
  SCRUB_PER_SPELL,
  soil,
  WEAR_PER_VISIT,
} from './upkeep';

describe('soil', () => {
  it('wears a venue down with every visit it takes', () => {
    const upkeep = createUpkeep(2);
    expect(cleanliness(upkeep, 0)).toBe(1);
    soil(upkeep, 0, 10);
    expect(cleanliness(upkeep, 0)).toBeCloseTo(1 - WEAR_PER_VISIT / 10);
    expect(cleanliness(upkeep, 1)).toBe(1);
  });

  it('wears a big venue more slowly per visit than a small one', () => {
    const upkeep = createUpkeep(2);
    soil(upkeep, 0, 40);
    soil(upkeep, 1, 1);
    expect(cleanliness(upkeep, 0)).toBeGreaterThan(cleanliness(upkeep, 1));
    const odd = createUpkeep(1);
    soil(odd, 0, 0);
    expect(cleanliness(odd, 0)).toBeCloseTo(1 - WEAR_PER_VISIT);
  });

  it('floors at filthy however many visits it takes', () => {
    const upkeep = createUpkeep(1);
    for (let visit = 0; visit < 10_000; visit++) soil(upkeep, 0, 1);
    expect(cleanliness(upkeep, 0)).toBe(0);
  });
});

describe('scrub', () => {
  it('caps at spotless however long somebody works', () => {
    const upkeep = createUpkeep(1);
    upkeep.level[0] = 0;
    scrub(upkeep, 0, SCRUB_PER_SPELL);
    expect(cleanliness(upkeep, 0)).toBeCloseTo(SCRUB_PER_SPELL);
    scrub(upkeep, 0, SCRUB_PER_SPELL);
    scrub(upkeep, 0, SCRUB_PER_SPELL);
    expect(cleanliness(upkeep, 0)).toBe(1);
  });
});

describe('cleanliness', () => {
  it('calls a venue it has no entry for spotless', () => {
    const upkeep = createUpkeep(2);
    expect(cleanliness(upkeep, 2)).toBe(1);
    expect(cleanliness(upkeep, -1)).toBe(1);
    soil(upkeep, 5, 1);
    scrub(upkeep, 5, 1);
    expect(upkeep.level).toHaveLength(2);
  });
});

const all = (): boolean => true;

describe('dirtiest', () => {
  it('passes over anything above the threshold and anything not eligible', () => {
    const upkeep = createUpkeep(4);
    upkeep.level.set([1, 0.5, 0.2, 0.75]);
    expect(dirtiest(upkeep, all, NEEDS_CLEANING)).toBe(2);
    expect(dirtiest(upkeep, (venue) => venue !== 2, NEEDS_CLEANING)).toBe(1);
    expect(dirtiest(upkeep, (venue) => venue === 0 || venue === 3, NEEDS_CLEANING)).toBe(-1);
    expect(dirtiest(createUpkeep(3), all, NEEDS_CLEANING)).toBe(-1);
  });

  it('breaks a tie towards the lower venue, so two runs agree', () => {
    const upkeep = createUpkeep(3);
    upkeep.level.set([0.3, 0.3, 0.3]);
    expect(dirtiest(upkeep, all, NEEDS_CLEANING)).toBe(0);
  });
});

describe('carryUpkeep', () => {
  it('keeps the dirt of whatever is still standing and starts new things clean', () => {
    const upkeep = createUpkeep(3);
    upkeep.level.set([0.2, 0.5, 0.9]);
    const from = [{ key: 'bakery#0' }, { key: 'pool#0' }, { key: 'bar#0' }];
    const to = [{ key: 'bar#0' }, { key: 'bakery#0' }, { key: 'restaurant#0' }];
    const carried = carryUpkeep(upkeep, from, to);
    expect(carried.level[0]).toBeCloseTo(0.9);
    expect(carried.level[1]).toBeCloseTo(0.2);
    expect(carried.level[2]).toBe(1);
    expect(carried.venues).toBe(3);
  });
});
