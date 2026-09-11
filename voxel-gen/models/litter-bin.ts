/**
 * Litter bin: a slatted timber drum with an iron collar and a dark mouth,
 * standing on a low sand-coloured slab. 16x16x7 (a 1.5 m bin on a 4 m tile), a
 * 1x1 tile. Radially symmetric, so it needs no turn.
 *
 * The same slab as the bench, the hedge and the flower bed, and for the same
 * reason: these are the things that stand along a walk, `path` is laid in the
 * sandy family, and a grey `stone` tile dropped into a sand-coloured network
 * reads as a patch of the wrong paving. Two layers, level with `PAVING_VOXELS`,
 * so the bin stands on the pavement rather than on a step in it.
 *
 * The drum is a box rather than a cylinder. At 25 cm a voxel a 1.5 m bin is six
 * voxels across, and a circle drawn in six voxels is a box with its corners
 * chipped — which costs four extra rectangles for a shape the eye reads as
 * square anyway from the height the ground is ever seen at. What makes it read
 * as a bin is the collar standing proud of it and the dark mouth inside that,
 * both of which are one rectangle each.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole tile: a model fills the footprint it claims. */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the drum stands. */
const GROUND = SLAB.height;

/** The drum: six voxels square, centred on the tile. */
const DRUM = { x: 5, x1: 10, z: 5, z1: 10 } as const;

/** The collar, one voxel proud of the drum on every side. */
const COLLAR = { x: 4, x1: 11, z: 4, z1: 11 } as const;

/** The mouth, inset from the collar, drawn in the deepest iron so it reads as a hole. */
const MOUTH = { x: 6, x1: 9, z: 6, z1: 9 } as const;

/** Layers of drum above the slab. Four is a metre, which is what a bin is. */
const DRUM_HEIGHT = 4;

export default defineModel({
  id: 'litter-bin',
  label: 'Litter Bin',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, teak } = PALETTE;

    plinth(b, SLAB);

    const top = GROUND + DRUM_HEIGHT - 1;
    box(DRUM.x, DRUM.x1, GROUND, top, DRUM.z, DRUM.z1, teak.base);
    // Two darker hoops, at the foot and under the collar, which is what holds
    // the staves of a drum together and what gives this one a waist.
    box(DRUM.x, DRUM.x1, GROUND, GROUND, DRUM.z, DRUM.z1, teak.shade);
    box(DRUM.x, DRUM.x1, top - 1, top - 1, DRUM.z, DRUM.z1, teak.shade);

    // The collar and the mouth inside it: the whole of what makes this a bin
    // rather than a bollard.
    box(COLLAR.x, COLLAR.x1, top + 1, top + 1, COLLAR.z, COLLAR.z1, metal.base);
    box(MOUTH.x, MOUTH.x1, top + 1, top + 1, MOUTH.z, MOUTH.z1, metal.deep);
  },
});
