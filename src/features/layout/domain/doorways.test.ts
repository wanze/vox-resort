import { describe, expect, it } from 'vitest';
import { TILE_VOXELS, type ModelDoor } from '../../../../voxel-gen/voxelgen.ts';
import { doorwayBeside, doorwayLookup, doorwaysOf } from './doorways';
import { place, type LayoutItem } from './resortLayout';
import { ROTATIONS } from './rotation';

const FRONT: ModelDoor = { x: 15, z: 2 * TILE_VOXELS - 2, facing: 0 };
const hut: LayoutItem = {
  id: 'hut',
  tilesX: 2,
  tilesZ: 2,
  width: 32,
  depth: 32,
  doors: [FRONT],
};
const itemOf = (id: string) => (id === hut.id ? hut : undefined);

describe('doorwaysOf', () => {
  it('opens a front door across the -z edge of the tile in front of it', () => {
    const standing = place(hut, 'hut#0', 4, 6);
    expect(doorwaysOf(standing, hut)).toEqual([{ tile: { x: 4, z: 8 }, rotation: 0 }]);
  });

  it('turns the doorway with the building, always facing back at it', () => {
    for (const rotation of ROTATIONS) {
      const standing = place(hut, 'hut#0', 4, 6, rotation);
      const [door] = doorwaysOf(standing, hut);
      const step = [
        [0, -1],
        [-1, 0],
        [0, 1],
        [1, 0],
      ][door!.rotation]!;
      const inside = { x: door!.tile.x + step[0]!, z: door!.tile.z + step[1]! };
      expect(inside.x >= 4 && inside.x < 6 && inside.z >= 6 && inside.z < 8).toBe(true);
    }
  });

  it('has none for a model that declares no doors', () => {
    const { doors: _doors, ...doorless } = hut;
    expect(doorwaysOf(place(doorless, 'shed', 0, 0), doorless)).toEqual([]);
  });
});

describe('doorway providers', () => {
  const standing = place(hut, 'hut#0', 4, 6);

  it('answers the same from a list of placements and from what stands across the edge', () => {
    const listed = doorwayLookup([standing], itemOf);
    const beside = doorwayBeside(
      (tile) => (tile.x >= 4 && tile.x < 6 && tile.z >= 6 && tile.z < 8 ? standing : undefined),
      itemOf,
    );
    for (const provider of [listed, beside]) {
      expect(provider(4, 8, 0)).toBe(true);
      expect(provider(5, 8, 0)).toBe(false);
      expect(provider(4, 8, 1)).toBe(false);
    }
  });
});
