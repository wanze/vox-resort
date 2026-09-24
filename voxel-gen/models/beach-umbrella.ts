import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const CANOPY = { radius: 7.4, peak: 13, slope: 0.78, wedges: 6 } as const;

export default defineModel({
  id: 'beach-umbrella',
  label: 'Beach Umbrella',
  category: 'grounds',
  placement: { ground: 'beach' },
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      pole: 0xc9b58d,
      canopyA: 0xe4574f,
      canopyB: 0xf3ece0,
      rim: 0xcf4740,
      finial: 0xb8433d,
    };

    const middle = 8;

    box(middle - 1, middle, 0, CANOPY.peak, middle - 1, middle, C.pole);

    for (let x = 0; x <= 15; x++) {
      for (let z = 0; z <= 15; z++) {
        const dx = x + 0.5 - middle;
        const dz = z + 0.5 - middle;
        const reach = Math.hypot(dx, dz);
        if (reach > CANOPY.radius) continue;

        const top = CANOPY.peak - Math.round(reach * CANOPY.slope);
        const wedge = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * CANOPY.wedges);
        const stripe = wedge % 2 === 0 ? C.canopyA : C.canopyB;
        const color = reach > CANOPY.radius - 1 ? C.rim : stripe;
        // Two voxels thick: a one-voxel cone shell is see-through along every step.
        set(x, top, z, color);
        set(x, top - 1, z, color);
      }
    }

    set(middle - 1, CANOPY.peak + 1, middle - 1, C.finial);
    set(middle, CANOPY.peak + 1, middle - 1, C.finial);
    set(middle - 1, CANOPY.peak + 1, middle, C.finial);
    set(middle, CANOPY.peak + 1, middle, C.finial);
  },
});
