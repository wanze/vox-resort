/**
 * Beach umbrella: a striped parasol open over a slim pole. 16x16x15, a 1x1 tile
 * — it stands beside the sun loungers rather than over them, so a row of the two
 * reads as a beach rather than as a furniture showroom.
 *
 * The canopy is a cone drawn as a height field: each cell's height falls with
 * its distance from the pole, and the stripe it takes comes from its angle round
 * it. Two voxels thick rather than one, because the cone steps down a voxel at a
 * time and a single-thickness shell would be see-through along every one of
 * those steps.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Canopy geometry, in voxels: how far it reaches and how steeply it falls. */
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

    // Middle of the tile, on the corner between the four central voxels.
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
        // The outermost ring takes the rim colour, which is what gives the
        // canopy an edge instead of letting the stripes run off it.
        const color = reach > CANOPY.radius - 1 ? C.rim : stripe;
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
