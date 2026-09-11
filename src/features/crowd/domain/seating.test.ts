import { describe, expect, it } from 'vitest';
import { TILE_VOXELS, type ModelSeat } from '../../../../voxel-gen/voxelgen.ts';
import { rotationRadians, type Rotation } from '../../layout/domain/rotation';
import { seatSpotsFor, type SeatSite } from './seating';

/** A bench-shaped model: one tile, three seats in a row facing its own +z. */
const BENCH: readonly ModelSeat[] = [4, 8, 12].map((x) => ({ x, y: 4, z: 7, facing: 0 }));

const benchAt = (tileX: number, tileZ: number, rotation: Rotation = 0): SeatSite => ({
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  y: 0,
  rotation,
  width: TILE_VOXELS,
  depth: TILE_VOXELS,
  seats: BENCH,
});

describe('seatSpotsFor', () => {
  it('puts an unturned model’s seats where the art declared them', () => {
    const [first, second, third] = seatSpotsFor([benchAt(2, 3)]);
    expect(first).toEqual({
      // Half a voxel on, because a person stands in the middle of a column.
      x: 2 * TILE_VOXELS + 4.5,
      z: 3 * TILE_VOXELS + 7.5,
      y: 4,
      heading: 0,
      tileX: 2,
      tileZ: 3,
    });
    expect(second!.x).toBe(first!.x + 4);
    expect(third!.x).toBe(first!.x + 8);
  });

  it('stands the seats on the terrace the object stands on', () => {
    const [spot] = seatSpotsFor([{ ...benchAt(0, 0), y: 8 }]);
    expect(spot!.y).toBe(12);
  });

  it('turns where the sitter looks along with where they sit', () => {
    // A quarter turn swings the model's +z round to +x, so the bench runs down
    // z and everybody on it looks east.
    const spots = seatSpotsFor([benchAt(0, 0, 1)]);
    expect(spots.map((spot) => spot.heading)).toEqual(([1, 1, 1] as const).map(rotationRadians));
    expect(spots.map((spot) => spot.z)).toEqual([12.5, 8.5, 4.5]);
    for (const spot of spots) expect(spot.x).toBe(7.5);
  });

  it('keeps a turned seat inside the tile the object claims', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      for (const spot of seatSpotsFor([benchAt(5, 6, rotation)])) {
        expect(spot.tileX, `turn ${rotation}`).toBe(5);
        expect(spot.tileZ, `turn ${rotation}`).toBe(6);
      }
    }
  });

  it('offers nothing for the objects that declare no seats', () => {
    expect(seatSpotsFor([{ ...benchAt(0, 0), seats: [] }])).toEqual([]);
    expect(seatSpotsFor([])).toEqual([]);
  });

  it('reports the tile a seat stands on, which is how its paving is found', () => {
    const spots = seatSpotsFor([benchAt(7, 9)]);
    for (const spot of spots) {
      expect(spot.tileX).toBe(Math.floor(spot.x / TILE_VOXELS));
      expect(spot.tileZ).toBe(Math.floor(spot.z / TILE_VOXELS));
    }
  });
});
