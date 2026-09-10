import { describe, expect, it } from 'vitest';
import { PALETTE } from '../palette.ts';
import { VoxelBuilder } from '../voxelgen.ts';
import { plinth } from './ground.ts';
import { poolWater } from './pool.ts';

const at = (b: VoxelBuilder, x: number, y: number, z: number): number | undefined =>
  b.voxels.get(`${x},${y},${z}`);

/** A deck four layers deep, which is what the swimming pool sinks its basins into. */
const deckOf = (w = 16, d = 16): VoxelBuilder => {
  const b = new VoxelBuilder();
  plinth(b, { x: 0, z: 0, w, d, height: 4 });
  return b;
};

describe('poolWater', () => {
  it('sinks the water a layer below the deck it is cut into', () => {
    const b = deckOf();
    const surface = poolWater(b, { x: 4, z: 4, w: 8, d: 8, deck: 3 });
    expect(surface).toBe(2);
    expect(at(b, 7, 2, 7)).toBe(PALETTE.water.base);
    expect(at(b, 7, 1, 7)).toBe(PALETTE.water.base);
    // The recess: the deck's own top layer is gone over the water.
    expect(at(b, 7, 3, 7)).toBeUndefined();
    // And the ground under the basin is still there to hold it.
    expect(at(b, 7, 0, 7)).toBe(PALETTE.stone.base);
  });

  it('holds the water in with a rim of coping, a ring either side of the edge', () => {
    const b = deckOf();
    poolWater(b, { x: 4, z: 4, w: 8, d: 8, deck: 3 });
    // The basin's own last ring is solid to the top of the deck.
    expect(at(b, 4, 3, 7)).toBe(PALETTE.stone.light);
    expect(at(b, 4, 1, 7)).toBe(PALETTE.stone.light);
    // The first ring of deck outside it is capped to match.
    expect(at(b, 3, 3, 7)).toBe(PALETTE.stone.light);
    // Two rings and no more: the third is the deck as it was laid.
    expect(at(b, 2, 3, 7)).toBe(PALETTE.stone.base);
  });

  it('digs only as deep as it is asked to', () => {
    const b = deckOf();
    poolWater(b, { x: 4, z: 4, w: 8, d: 8, deck: 3, depth: 1 });
    expect(at(b, 7, 2, 7)).toBe(PALETTE.water.base);
    expect(at(b, 7, 1, 7)).toBe(PALETTE.stone.base);
  });

  it('rounds a basin into the rectangle it is given', () => {
    const b = deckOf(24, 24);
    poolWater(b, { x: 4, z: 4, w: 16, d: 16, shape: 'round', deck: 3 });
    // The middle of each side is water, the corners of the rectangle are not.
    expect(at(b, 11, 2, 6)).toBe(PALETTE.water.base);
    expect(at(b, 6, 2, 11)).toBe(PALETTE.water.base);
    expect(at(b, 4, 3, 4)).toBe(PALETTE.stone.base);
    expect(at(b, 19, 3, 19)).toBe(PALETTE.stone.base);
  });

  it('rounds the same basin whichever corner it is measured from', () => {
    const b = deckOf(24, 24);
    poolWater(b, { x: 4, z: 4, w: 15, d: 15, shape: 'round', deck: 3 });
    const wet = (x: number, z: number): boolean => at(b, x, 2, z) === PALETTE.water.base;
    for (let step = 0; step < 15; step++) {
      expect(wet(4 + step, 11), `x ${step}`).toBe(wet(18 - step, 11));
      expect(wet(11, 4 + step), `z ${step}`).toBe(wet(11, 18 - step));
    }
  });

  it('paints the same colours whatever the deck stands at', () => {
    const b = new VoxelBuilder();
    plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 9 });
    expect(poolWater(b, { x: 4, z: 4, w: 8, d: 8, deck: 8, depth: 3 })).toBe(7);
    expect(at(b, 7, 7, 7)).toBe(PALETTE.water.base);
    expect(at(b, 7, 5, 7)).toBe(PALETTE.water.base);
    expect(at(b, 7, 4, 7)).toBe(PALETTE.stone.base);
    expect(at(b, 7, 8, 7)).toBeUndefined();
  });

  it('refuses a basin with no water in it, and one with no ground under it', () => {
    expect(() => poolWater(deckOf(), { x: 4, z: 4, w: 2, d: 8, deck: 3 })).toThrow(/3 voxels/);
    expect(() => poolWater(deckOf(), { x: 4, z: 4, w: 8, d: 8, deck: 3, depth: 0 })).toThrow(
      /one layer/,
    );
    expect(() => poolWater(deckOf(), { x: 4, z: 4, w: 8, d: 8, deck: 3, depth: 3 })).toThrow(
      /ground under/,
    );
  });
});
