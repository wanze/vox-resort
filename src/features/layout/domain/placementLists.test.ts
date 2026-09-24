import { describe, expect, it } from 'vitest';
import { listOf, PROP_IDS, RAIL_IDS } from './placementLists';
import { PAVING_IDS } from './resortPlan';

describe('listOf', () => {
  it('files every rail with the rails', () => {
    for (const id of RAIL_IDS) expect(listOf(id), id).toBe('rails');
  });

  it('files every scattered prop with the props', () => {
    for (const id of PROP_IDS) expect(listOf(id), id).toBe('props');
  });

  it('files every kind of paving with the paths', () => {
    for (const id of PAVING_IDS) expect(listOf(id), id).toBe('paths');
  });

  it('counts a building as an object', () => {
    expect(listOf('hotel')).toBe('placements');
  });

  it('counts an id nothing claims as an object', () => {
    expect(listOf('no-such-object')).toBe('placements');
  });

  it('never has one id in two of the sets', () => {
    // Otherwise it is filed by whichever check runs first, and a rail that was also a prop would be baked as one.
    const sets = [RAIL_IDS, PROP_IDS, PAVING_IDS];
    const seen = new Set<string>();
    let total = 0;
    for (const set of sets) {
      total += set.size;
      for (const id of set) seen.add(id);
    }
    expect(seen.size).toBe(total);
  });
});
