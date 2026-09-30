import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { doorStepTile } from '../../layout/domain/doorStep';
import type { Placement } from '../../layout/domain/resortLayout';
import { depotForShift, depotsOn } from './depots';
import { NO_ZONE } from './zones';

const at = (key: string, id: string, tileX = 0, tileZ = 0, tiles = 1): Placement => ({
  key,
  id,
  tileX,
  tileZ,
  tilesX: tiles,
  tilesZ: tiles,
  rotation: 0,
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  y: 0,
  width: tiles * TILE_VOXELS,
  depth: tiles * TILE_VOXELS,
});

describe('depotsOn', () => {
  it('keeps the staff house and leaves the bakery and the gate to the others', () => {
    const depots = depotsOn([
      at('bakery#0', 'bakery'),
      at('staff-house#0', 'staff-house', 4, 0, 2),
      at('entrance#0', 'entrance', 8, 0),
    ]);
    expect(depots.map((depot) => depot.key)).toEqual(['staff-house#0']);
    expect(depots[0]).toMatchObject({ tileX: 4, tileZ: 0, tilesX: 2, tilesZ: 2 });
    expect(depots[0]!.x).toBe(4 * TILE_VOXELS + TILE_VOXELS);
  });

  it('turns the door with the house, onto the side the doorway now faces', () => {
    const straight = depotsOn([at('staff-house#0', 'staff-house', 4, 6, 2)])[0]!;
    const turned = depotsOn([{ ...at('staff-house#0', 'staff-house', 4, 6, 2), rotation: 1 }])[0]!;
    expect(straight.doors).toHaveLength(1);
    expect(doorStepTile(straight, straight.doors[0]!).z).toBe(8);
    expect(turned.doors[0]!.facing).toBe(1);
    expect(doorStepTile(turned, turned.doors[0]!).x).toBe(6);
  });

  it('finds none on a plot without a staff house', () => {
    expect(depotsOn([at('bakery#0', 'bakery'), at('palm#0', 'palm', 3)])).toEqual([]);
  });
});

describe('depotForShift', () => {
  it('deals an unzoned shift round the depots in turn, and says -1 with none', () => {
    const depotZones = new Int32Array(3);
    expect([0, 1, 2, 3].map((turn) => depotForShift(turn, NO_ZONE, depotZones))).toEqual([
      0, 1, 2, 0,
    ]);
    expect(depotForShift(0, NO_ZONE, new Int32Array(0))).toBe(-1);
  });

  it('keeps a zoned worker to the depots in their zone, and falls back when there is none', () => {
    const depotZones = Int32Array.from([0b01, 0b10, 0b10]);
    expect([0, 1, 2].map((turn) => depotForShift(turn, 1, depotZones))).toEqual([1, 2, 1]);
    expect(depotForShift(1, 2, depotZones), 'no depot in zone 2').toBe(1);
  });
});
