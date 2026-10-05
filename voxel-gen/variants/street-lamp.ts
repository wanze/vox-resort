import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const GLOW = PALETTE.amber.light;

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const PEDESTAL = { x: 6, x1: 9, z: 6, z1: 9 } as const;

// Two wide because the tile is sixteen: a one-voxel post cannot sit on its centre.
const POST = { x: 7, x1: 8, z: 7, z1: 8 } as const;

// Hung off a bracket rather than set on the post, so the lantern clears the post by
// a voxel and the light falls on the path beside the pedestal, not on the stone.
const LANTERN = { x: 2, x1: 4, z: 6, z1: 8, y: 13, y1: 16 } as const;

const ARM = LANTERN.y1 + 4;

export default defineModel({
  id: 'street-lamp-b',
  label: 'Street Lamp B',
  category: 'grounds',
  scenery: 0.2,
  tiles: { x: 1, z: 1 },
  emissive: [GLOW],
  lights: [{ x: 3, y: 14, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, stone } = PALETTE;

    plinth(b, SLAB);

    const P = PEDESTAL;
    box(P.x - 1, P.x1 + 1, GROUND, GROUND, P.z - 1, P.z1 + 1, stone.base);
    box(P.x, P.x1, GROUND + 1, GROUND + 2, P.z, P.z1, stone.light);
    box(P.x, P.x1, GROUND + 3, GROUND + 3, P.z, P.z1, stone.base);

    box(POST.x, POST.x1, GROUND + 4, ARM, POST.z, POST.z1, metal.shade);
    box(POST.x, POST.x1, ARM + 1, ARM + 1, POST.z, POST.z1, metal.deep);

    const L = LANTERN;
    const hub = { x: L.x + 1, x1: L.x1 - 1, z: L.z + 1, z1: L.z1 - 1 };
    box(hub.x, POST.x - 1, ARM, ARM, POST.z, POST.z1, metal.shade);
    // The scroll under the arm is what makes it read as wrought iron and not a gallows.
    box(POST.x - 1, POST.x - 1, ARM - 2, ARM - 1, POST.z, POST.z1, metal.shade);
    box(POST.x - 2, POST.x - 2, ARM - 1, ARM - 1, POST.z, POST.z1, metal.shade);

    box(hub.x, hub.x1, L.y - 1, L.y - 1, hub.z, hub.z1, metal.base);
    box(L.x, L.x1, L.y, L.y1, L.z, L.z1, GLOW);
    for (const x of [L.x, L.x1]) {
      for (const z of [L.z, L.z1]) box(x, x, L.y, L.y1, z, z, metal.deep);
    }
    box(L.x - 1, L.x1 + 1, L.y1 + 1, L.y1 + 1, L.z - 1, L.z1 + 1, metal.base);
    box(L.x, L.x1, L.y1 + 2, L.y1 + 2, L.z, L.z1, metal.base);
    box(hub.x, hub.x1, L.y1 + 3, ARM - 1, hub.z, hub.z1, metal.deep);
  },
});
