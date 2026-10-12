import { describe, expect, it } from 'vitest';
import { shoreFor } from '../../layout/domain/shoreline';
import { exposureOf, STORM_REACH, stormHitsAt, type Footprint } from './stormDamage';

// Water from z = 18, sand from z = 12.
const shore = shoreFor({
  tilesX: 40,
  tilesZ: 20,
  shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
})!;

const at = (key: string, tileX: number, tileZ: number, tilesZ = 2): Footprint => ({
  key,
  tileX,
  tileZ,
  tilesX: 2,
  tilesZ,
});

const front = Array.from({ length: 10 }, (_, index) => at(`bar-${index}`, index * 3, 15, 3));

const stormDays = (places: readonly Footprint[], days: number): number[] =>
  Array.from({ length: days }, (_, day) => {
    let hits = 0;
    for (let hour = day * 24; hour < (day + 1) * 24; hour++) {
      hits += stormHitsAt(places, shore, hour, Infinity, () => false).length;
    }
    return hits;
  });

describe('exposureOf', () => {
  it('is full on the water’s edge and nothing out of the spray', () => {
    expect(exposureOf(shore, at('edge', 4, 16))).toBe(1);
    expect(exposureOf(shore, at('inland', 4, 18 - STORM_REACH - 2))).toBe(0);
  });

  it('falls off with the sand between a building and the water', () => {
    const near = exposureOf(shore, at('near', 4, 14));
    const far = exposureOf(shore, at('far', 4, 12));
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('counts a building standing in the water as on the edge', () => {
    expect(exposureOf(shore, at('pier', 4, 17, 4))).toBe(1);
  });

  it('spares everything where there is no sea', () => {
    expect(exposureOf(null, at('edge', 4, 16))).toBe(0);
  });
});

describe('stormHitsAt', () => {
  it('batters about one of ten buildings on the edge a storm, sometimes none', () => {
    const days = stormDays(front, 400);
    const mean = days.reduce((sum, hits) => sum + hits, 0) / days.length;
    const calm = days.filter((hits) => hits === 0).length / days.length;
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(1.6);
    expect(calm).toBeGreaterThan(0.2);
    expect(calm).toBeLessThan(0.45);
  });

  it('never reaches inland', () => {
    const inland = Array.from({ length: 10 }, (_, index) => at(`cafe-${index}`, index * 3, 2));
    expect(stormDays(inland, 50).every((hits) => hits === 0)).toBe(true);
  });

  it('dents by a fifth to a third', () => {
    for (let hour = 0; hour < 2000; hour++) {
      for (const hit of stormHitsAt(front, shore, hour, Infinity, () => false)) {
        expect(hit.dent).toBeGreaterThanOrEqual(0.2);
        expect(hit.dent).toBeLessThanOrEqual(0.35);
      }
    }
  });

  it('keeps to the room it is given and leaves the spared alone', () => {
    let seen = 0;
    for (let hour = 0; hour < 2000; hour++) {
      const hits = stormHitsAt(front, shore, hour, 1, (key) => key === 'bar-0');
      expect(hits.length).toBeLessThanOrEqual(1);
      expect(hits.some((hit) => hit.key === 'bar-0')).toBe(false);
      seen += hits.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('is the same storm on a replay', () => {
    const one = stormHitsAt(front, shore, 77, Infinity, () => false);
    const other = stormHitsAt(front, shore, 77, Infinity, () => false);
    expect(one).toEqual(other);
  });
});
