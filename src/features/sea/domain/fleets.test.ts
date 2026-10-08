import { describe, expect, it } from 'vitest';
import type { ModelFleet, ModelHire } from '../../../../voxel-gen/voxelgen.ts';
import { fleetAllowances, fleetHutKeys, fleetsFor, hutAllowances, type RentalHut } from './fleets';

const PEDALOS: ModelFleet = { craft: 'pedalo', count: 6, riders: 2, pace: 0.6 };

const BANANA: ModelFleet = { craft: 'speedboat', count: 1, riders: 4, pace: 2.2, tows: 'banana' };
const JET_SKIS: ModelFleet = { craft: 'jet-ski', count: 4, riders: 2, pace: 2.6 };

describe('fleetAllowances', () => {
  it('sends a pedalo out for every pair at the hut, and a lone hirer too, up to the rack', () => {
    for (let hirers = 0; hirers <= 20; hirers++) {
      expect(fleetAllowances(hirers, [PEDALOS])).toEqual([Math.min(6, Math.ceil(hirers / 2))]);
    }
  });

  it('sends the banana out only full, and the jet skis with the rest', () => {
    expect(fleetAllowances(3, [BANANA, JET_SKIS])).toEqual([0, 2]);
    expect(fleetAllowances(4, [BANANA, JET_SKIS])).toEqual([1, 0]);
    expect(fleetAllowances(7, [BANANA, JET_SKIS])).toEqual([1, 2]);
    expect(fleetAllowances(12, [BANANA, JET_SKIS])).toEqual([1, 4]);
  });

  it('never lets out more of a fleet than it has', () => {
    for (let hirers = 0; hirers <= 40; hirers++) {
      const [banana, jetSkis] = fleetAllowances(hirers, [BANANA, JET_SKIS]);
      expect(banana).toBeLessThanOrEqual(BANANA.count);
      expect(jetSkis).toBeLessThanOrEqual(JET_SKIS.count);
    }
  });
});

describe('fleetsFor', () => {
  it('puts two huts’ fleets on the sea in placement order, each in the order it declares', () => {
    const hires: Record<string, ModelHire> = {
      pedalos: { fleets: [PEDALOS] },
      sports: { fleets: [BANANA, JET_SKIS] },
    };
    const huts: RentalHut[] = [
      { x: 400, z: 300, key: 'b', id: 'sports' },
      { x: 100, z: 300, key: 'a', id: 'pedalos' },
    ];
    const index = ['buoy', 'pedalo', 'jet-ski', 'speedboat', 'banana'];
    const fleets = fleetsFor(
      huts,
      (id) => hires[id] ?? null,
      (id) => index.indexOf(id),
      5,
    );
    expect(fleets.map((fleet) => [fleet.rental.x, fleet.variant, fleet.count])).toEqual([
      [400, 3, 1],
      [400, 2, 4],
      [100, 1, 6],
    ]);
    expect(fleets[0]!.tows).toBe(4);
    expect(fleets[1]!.tows).toBeUndefined();
    expect(fleets[2]!.pace).toBeCloseTo(3);
  });
});

describe('hutAllowances', () => {
  it('lets each hut’s fleets out by its own visitors, a pulled-down hut sending none', () => {
    const hires: Record<string, ModelHire> = {
      pedalos: { fleets: [PEDALOS] },
      sports: { fleets: [BANANA, JET_SKIS] },
    };
    const huts: RentalHut[] = [
      { x: 400, z: 300, key: 'b', id: 'sports' },
      { x: 100, z: 300, key: 'a', id: 'pedalos' },
      { x: 700, z: 300, key: 'gone', id: 'pedalos' },
    ];
    const inside: Record<string, number> = { a: 5, b: 6 };
    const allowed = hutAllowances(
      huts,
      (id) => hires[id] ?? null,
      (key) => inside[key] ?? 0,
    );
    expect(allowed).toEqual([1, 1, 3, 0]);
  });
});

describe('fleetHutKeys', () => {
  it('names the hut of every fleet fleetsFor lays, in the same order', () => {
    const hires: Record<string, ModelHire> = {
      pedalos: { fleets: [PEDALOS] },
      sports: { fleets: [BANANA, JET_SKIS] },
    };
    const huts: RentalHut[] = [
      { x: 400, z: 300, key: 'b', id: 'sports' },
      { x: 100, z: 300, key: 'a', id: 'pedalos' },
    ];
    const hireOf = (id: string): ModelHire | null => hires[id] ?? null;
    const keys = fleetHutKeys(huts, hireOf);
    const fleets = fleetsFor(huts, hireOf, () => 1, 1);
    expect(keys).toEqual(['b', 'b', 'a']);
    expect(keys).toHaveLength(fleets.length);
    expect(fleets.map((fleet) => huts.find((hut) => hut === fleet.rental)!.key)).toEqual(keys);
  });
});
