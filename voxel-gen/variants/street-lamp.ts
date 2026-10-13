import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const GLOW = PALETTE.amber.light;

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

// One voxel wide, which a sixteen-voxel tile cannot centre: it stands half a voxel off, too
// little to see.
const POST = { x: 7, z: 7 } as const;

// Glass at a guest's waist and the cap below their head: a light for paths on the sand,
// where a tall post towers over the loungers.
const GLASS = { y: GROUND + 3, y1: GROUND + 4 } as const;

export default defineModel({
  id: 'street-lamp-b',
  label: 'Street Lamp B',
  category: 'grounds',
  scenery: 0.2,
  tiles: { x: 1, z: 1 },
  emissive: [GLOW],
  // Dimmer and nearer than the street lamp's, as it hangs lower; still enough to light a path.
  lights: [{ x: POST.x, y: GLASS.y1, z: POST.z, color: GLOW, intensity: 70, distance: 38 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, stone } = PALETTE;
    const { x, z } = POST;

    const cross = (y: number, color: number): void => {
      box(x - 1, x + 1, y, y, z, z, color);
      box(x, x, y, y, z - 1, z + 1, color);
    };

    plinth(b, SLAB);

    cross(GROUND, stone.base);
    box(x, x, GROUND + 1, GLASS.y - 1, z, z, metal.shade);
    box(x, x, GLASS.y, GLASS.y1, z, z, GLOW);
    cross(GLASS.y1 + 1, metal.base);
  },
});
