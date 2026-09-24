import { describe, expect, it } from 'vitest';
import { TILE_VOXELS, type ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { doorStepTile, placedDoors } from './doorStep';

const WIDTH = 32;
const DEPTH = 48;

const FRONT: ModelDoor = { x: 15, z: DEPTH - 2, facing: 0 };

describe('placedDoors', () => {
  it('offsets an unturned door by the corner the model stands at', () => {
    const [door] = placedDoors({ x: 160, z: 320, rotation: 0 }, [FRONT], WIDTH, DEPTH);
    expect(door).toEqual({ x: 175, z: 366, facing: 0 });
  });

  it('turns an odd-turned door against the model size before the turn', () => {
    const [door] = placedDoors({ x: 0, z: 0, rotation: 1 }, [FRONT], WIDTH, DEPTH);
    expect(door).toEqual({ x: DEPTH - 2, z: WIDTH - 15, facing: 1 });
  });
});

describe('doorStepTile', () => {
  const cottage = { tileX: 4, tileZ: 6, tilesX: 2, tilesZ: 3 };

  it('opens a front door onto the tile in front of the footprint', () => {
    const door = { x: 4 * TILE_VOXELS + 15, z: 9 * TILE_VOXELS - 2, facing: 0 } as const;
    expect(doorStepTile(cottage, door)).toEqual({ x: 4, z: 9 });
  });

  it('comes out on the same tile wherever across the footprint the door was measured', () => {
    for (const z of [6 * TILE_VOXELS, 7 * TILE_VOXELS + 3, 12 * TILE_VOXELS]) {
      expect(doorStepTile(cottage, { x: 5 * TILE_VOXELS + 1, z, facing: 0 })).toEqual({
        x: 5,
        z: 9,
      });
    }
  });

  it('steps out of each of the four sides', () => {
    const middle = { x: 5 * TILE_VOXELS, z: 7 * TILE_VOXELS + 8 };
    expect(doorStepTile(cottage, { ...middle, facing: 1 })).toEqual({ x: 6, z: 7 });
    expect(doorStepTile(cottage, { ...middle, facing: 2 })).toEqual({ x: 5, z: 5 });
    expect(doorStepTile(cottage, { ...middle, facing: 3 })).toEqual({ x: 3, z: 7 });
  });
});
