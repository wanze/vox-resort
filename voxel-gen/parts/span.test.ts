import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { BRIDGE_VOXELS, PAVING_VOXELS, TILE_VOXELS, VoxelBuilder } from '../voxelgen.ts';
import {
  FLANK,
  lanternLight,
  LANTERN,
  PILE_ROWS,
  rampPlanksAt,
  RAMP_TREADS,
  spanDeck,
  spanLantern,
  spanParapet,
  spanPiles,
} from './span.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

const N = TILE_VOXELS - 1;

/** One run of deck at the height the bridge lays its planks. */
const deckOf = (y = 5): VoxelBuilder => {
  const b = new VoxelBuilder();
  spanDeck(b, { y, z0: 0, z1: N });
  return b;
};

/** A parapet along the north edge, guarding planks laid level at `planks`. */
const parapetOf = (planks = 5): VoxelBuilder => {
  const b = new VoxelBuilder();
  spanParapet(b, { planksAt: () => planks });
  return b;
};

describe('spanDeck', () => {
  it('lays the planking in the layer it is given, on a beam under it', () => {
    const b = deckOf();
    expect(at(b, 1, 5, 8)).toBe(PALETTE.teak.base);
    expect(at(b, 1, 4, 8)).toBe(PALETTE.teak.deep);
    // Boards four wide in two tones, with the dark joint on every fourth.
    expect(at(b, 5, 5, 8)).toBe(PALETTE.teak.shade);
    expect(at(b, 4, 5, 8)).toBe(PALETTE.teak.deep);
  });

  it('runs the beam the whole width, so two tiles butt into one band of timber', () => {
    const b = deckOf();
    for (const x of [0, N])
      expect({ x, beam: at(b, x, 4, 0) }).toEqual({ x, beam: PALETTE.teak.deep });
  });

  it('draws nothing along its flanks: a parapet is a railing of its own', () => {
    const b = deckOf();
    for (const x of [0, N]) {
      expect({ x, above: at(b, x, 6, 8), below: at(b, x, 3, 8) }).toEqual({
        x,
        above: undefined,
        below: undefined,
      });
    }
  });

  it('paints only the rows it is asked for, so a ramp can lay four of them', () => {
    const b = new VoxelBuilder();
    spanDeck(b, { y: 2, z0: 0, z1: 3 });
    expect(at(b, 8, 2, 3)).toBeDefined();
    expect(at(b, 8, 2, 4)).toBeUndefined();
  });

  it('refuses a run with no rows in it, and one with no room for a beam', () => {
    expect(() => spanDeck(new VoxelBuilder(), { y: 5, z0: 4, z1: 3 })).toThrow();
    expect(() => spanDeck(new VoxelBuilder(), { y: 0, z0: 0, z1: N })).toThrow();
  });
});

describe('spanPiles', () => {
  it('stands the deck on the bed of the water, clear of every edge', () => {
    const b = deckOf();
    spanPiles(b, { beam: 4, rows: PILE_ROWS });
    const piles = [...b.voxels.keys()]
      .map((key) => key.split(',').map(Number) as [number, number, number])
      .filter(([, y]) => y < 4);
    expect(piles.some(([, y]) => y === 0)).toBe(true);
    // Never in a column a railing's trestle stands in, along any of the four edges.
    for (const [x, , z] of piles) {
      expect({ x, z, clear: Math.min(x, z, N - x, N - z) >= FLANK }).toEqual({
        x,
        z,
        clear: true,
      });
    }
  });

  it('leaves the water open under the middle of the deck', () => {
    const b = deckOf();
    spanPiles(b, { beam: 4, rows: PILE_ROWS });
    expect(at(b, 8, 2, 8)).toBeUndefined();
  });
});

describe('spanParapet', () => {
  it('stands a rail a metre over the planking, with a kick rail on its edge', () => {
    const b = parapetOf();
    expect(at(b, 8, 9, 0)).toBe(PALETTE.teak.light);
    expect(at(b, 8, 6, 0)).toBe(PALETTE.teak.shade);
  });

  it('leaves the run between its posts open, which is what reads as a fence', () => {
    const b = parapetOf();
    expect(at(b, 0, 7, 0)).toBe(PALETTE.teak.shade);
    expect(at(b, 1, 7, 0)).toBeUndefined();
    expect(at(b, 5, 7, 0)).toBe(PALETTE.teak.shade);
  });

  it('carries its trestle from the bed up to the beam, and paints neither beam nor planks', () => {
    // The layers the deck paints stay empty, so a railing and the deck it guards
    // never draw the same voxel.
    const b = parapetOf();
    for (const z of [0, FLANK - 1]) {
      expect({ z, bed: at(b, 8, 0, z), top: at(b, 8, 3, z) }).toEqual({
        z,
        bed: PALETTE.teak.deep,
        top: PALETTE.teak.deep,
      });
      expect({ z, beam: at(b, 8, 4, z), planks: at(b, 8, 5, z) }).toEqual({
        z,
        beam: undefined,
        planks: undefined,
      });
    }
  });

  it('steps with the planking it is given along the edge', () => {
    const b = new VoxelBuilder();
    spanParapet(b, { planksAt: rampPlanksAt });
    expect(at(b, 0, rampPlanksAt(0) + 4, 0)).toBe(PALETTE.teak.light);
    expect(at(b, N, rampPlanksAt(N) + 4, 0)).toBe(PALETTE.teak.light);
    expect(at(b, 0, rampPlanksAt(N) + 4, 0)).toBeUndefined();
  });
});

describe('rampPlanksAt', () => {
  it('climbs from one above the paving to the deck in whole treads', () => {
    expect(rampPlanksAt(0)).toBe(PAVING_VOXELS);
    expect(rampPlanksAt(N)).toBe(BRIDGE_VOXELS - 1);
    expect(RAMP_TREADS).toBe(BRIDGE_VOXELS - PAVING_VOXELS);
  });
});

describe('spanLantern', () => {
  it('declares its light inside its own glass', () => {
    const b = new VoxelBuilder();
    const spot = { x: 7, rail: 9 };
    spanLantern(b, spot);
    const light = lanternLight(spot);
    // The light sits on the corner the four glass voxels share, so each of them
    // is one of the voxels around it.
    expect(at(b, light.x, light.y, light.z)).toBe(LANTERN);
    expect(at(b, light.x - 1, light.y - 1, light.z - 1)).toBe(LANTERN);
    expect(light.color).toBe(LANTERN);
  });
});
