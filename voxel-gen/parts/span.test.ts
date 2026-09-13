import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { TILE_VOXELS, VoxelBuilder } from '../voxelgen.ts';
import { spanDeck } from './span.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

const N = TILE_VOXELS - 1;

/** One run of deck at the height the bridge lays its planks, over open water. */
const deckOf = (y = 5, foot = 0): VoxelBuilder => {
  const b = new VoxelBuilder();
  spanDeck(b, { y, z0: 0, z1: N, foot });
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

  it('leaves the middle open under the planks, so the water runs under the span', () => {
    const b = deckOf();
    expect(at(b, 8, 2, 8)).toBeUndefined();
    // And the two flanks are the trestles that carry it.
    expect(at(b, 0, 2, 8)).toBe(PALETTE.teak.deep);
    expect(at(b, N, 2, 8)).toBe(PALETTE.teak.deep);
  });

  it('draws no trestle where its foot is already at the beam', () => {
    const b = deckOf(5, 4);
    expect(at(b, 0, 2, 8)).toBeUndefined();
    expect(at(b, 0, 5, 8)).toBe(PALETTE.teak.deep);
  });

  it('stands a rail a metre over the planking, up both flanks', () => {
    const b = deckOf();
    for (const x of [0, N]) {
      expect({ x, rail: at(b, x, 9, 8) }).toEqual({ x, rail: PALETTE.teak.light });
      expect({ x, kick: at(b, x, 6, 8) }).toEqual({ x, kick: PALETTE.teak.shade });
    }
  });

  it('leaves the run between its posts open, which is what reads as a fence', () => {
    const b = deckOf();
    // A post at the tile's own edge, and nothing in the gap after it.
    expect(at(b, 0, 7, 0)).toBe(PALETTE.teak.shade);
    expect(at(b, 0, 7, 1)).toBeUndefined();
    expect(at(b, 0, 7, 5)).toBe(PALETTE.teak.shade);
  });

  it('paints only the rows it is asked for, so a ramp can lay four of them', () => {
    const b = new VoxelBuilder();
    spanDeck(b, { y: 2, z0: 0, z1: 3, foot: 0 });
    expect(at(b, 8, 2, 3)).toBeDefined();
    expect(at(b, 8, 2, 4)).toBeUndefined();
  });

  it('refuses a run with no rows in it, and one with no room for a beam', () => {
    expect(() => spanDeck(new VoxelBuilder(), { y: 5, z0: 4, z1: 3, foot: 0 })).toThrow();
    expect(() => spanDeck(new VoxelBuilder(), { y: 0, z0: 0, z1: N, foot: 0 })).toThrow();
  });
});
