import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three/webgpu';
import { TILE_VOXELS, type ModelSeat } from '../../../../voxel-gen/voxelgen.ts';
import {
  rotateExtent,
  rotationRadians,
  ROTATIONS,
  turnedOrigin,
  type Rotation,
} from '../../layout/domain/rotation';
import { seatSpotsFor, type SeatSite } from './seating';

const BENCH: readonly ModelSeat[] = [4, 8, 12].map((x) => ({ x, y: 4, z: 7, facing: 0 }));

const LOUNGER: readonly ModelSeat[] = [{ x: 7, y: 5, z: 8, facing: 0, pose: 'lie' }];

const benchAt = (tileX: number, tileZ: number, rotation: Rotation = 0): SeatSite => ({
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  y: 0,
  rotation,
  width: TILE_VOXELS,
  depth: TILE_VOXELS,
  seats: BENCH,
});

// Built the way writeSlot builds it, so a seat is checked against the drawn model.
function instanceMatrix(site: SeatSite): Matrix4 {
  const turned = rotateExtent(site.width, site.depth, site.rotation);
  const origin = turnedOrigin(turned.x, turned.z, site.rotation);
  return new Matrix4()
    .makeRotationY(rotationRadians(site.rotation))
    .setPosition(site.x + origin.x, site.y, site.z + origin.z);
}

describe('seatSpotsFor', () => {
  it('sits on the centre of the voxel the drawn model turned the seat onto', () => {
    const seats: readonly ModelSeat[] = [
      { x: 0, y: 4, z: 0, facing: 0 },
      { x: 5, y: 4, z: 13, facing: 1 },
      { x: 31, y: 4, z: 15, facing: 2 },
    ];
    for (const rotation of ROTATIONS) {
      const site: SeatSite = { x: 48, z: 80, y: 0, rotation, width: 32, depth: 16, seats };
      const matrix = instanceMatrix(site);
      for (const [index, spot] of seatSpotsFor([site]).entries()) {
        const seat = seats[index]!;
        const centre = new Vector3(seat.x + 0.5, 0, seat.z + 0.5).applyMatrix4(matrix);
        expect({ rotation, seat: index, x: spot.x, z: spot.z }).toEqual({
          rotation,
          seat: index,
          x: Math.round(centre.x * 2) / 2,
          z: Math.round(centre.z * 2) / 2,
        });
      }
    }
  });

  it('puts an unturned model’s seats where the art declared them', () => {
    const [first, second, third] = seatSpotsFor([benchAt(2, 3)]);
    expect(first).toEqual({
      x: 2 * TILE_VOXELS + 4.5,
      z: 3 * TILE_VOXELS + 7.5,
      y: 4,
      heading: 0,
      pose: 'sit',
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
    const spots = seatSpotsFor([benchAt(0, 0, 1)]);
    expect(spots.map((spot) => spot.heading)).toEqual(([1, 1, 1] as const).map(rotationRadians));
    expect(spots.map((spot) => spot.z)).toEqual([11.5, 7.5, 3.5]);
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

  it('carries the pose the art declared, and sitting where it declared none', () => {
    expect(seatSpotsFor([{ ...benchAt(0, 0), seats: LOUNGER }])[0]!.pose).toBe('lie');
    expect(seatSpotsFor([benchAt(0, 0)])[0]!.pose).toBe('sit');
  });

  it('turns a lounger without turning what somebody on it is doing', () => {
    const spots = seatSpotsFor([{ ...benchAt(4, 4, 3), seats: LOUNGER }]);
    expect(spots[0]!.pose).toBe('lie');
    expect(spots[0]!.heading).toBeCloseTo(rotationRadians(3));
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
