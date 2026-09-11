/**
 * Flower bed: a terracotta-kerbed bed of soil with a green cushion of planting
 * over it and a clipped crown of red and yellow blossom on top, on a low paving
 * slab. 16x16x7 (a 2.5 m bed on a 4 m tile), a 1x1 tile.
 *
 * Smaller and flatter than the bed it replaces, and both are the same decision.
 * The old one was a 3 m timber box filled by taking `[red, pink, yellow]` at
 * `(x + z) % 3` across a 10x10 top and raising each column to `(x * 5 + z * 3) %
 * 3` — a dither in two dimensions with a random height field over it, which is
 * the one thing `docs/art-direction.md` says never to do and the reason a prop
 * this size cost **470 triangles**, ten times a hedge. Nothing merged: every
 * blossom was its own column of six quads.
 *
 * Drawn as three flat courses instead — an 8x8 cushion of `foliage`, and a 6x6
 * crown of `bloom` and `amber` over it, each a rectangle the mesher takes whole —
 * it is a bed rather than a field of confetti, and the pass pays for itself many
 * times over. The blossoms are two colours across one step instead of three
 * scattered over a hundred cells, which is what lets them read as planting: a
 * bed of flowers seen from 30 degrees above is a patch of colour, and a patch is
 * what this grid can actually draw.
 *
 * The kerb is terracotta rather than timber for the same reason the hedge's
 * green moved: it is the pot the potted plants stand in, so the beds, the pots
 * and the roofs agree on one clay. The soil is `teak.deep`, which is the
 * darkest step of the catalogue's structural timber and reads as wet earth
 * under planting.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/**
 * The slab, which is the whole tile: a model fills the footprint it claims.
 *
 * Two layers, level with `PAVING_VOXELS`, so a bed beside a path is planting at
 * the path's own height rather than a step in it. Same slab as the hedge and the
 * bench, which are the other two things that stand along a walk — `sand` rather
 * than the `plinth` part's default `stone`, because that is what `path` is laid
 * in and what every tree and lamp already stands on. A bed is dressing on a
 * verge, not a plot with a building on it.
 */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, which the kerb stands on. */
const GROUND = SLAB.height;

/** The bed: 12 of the 16 voxels across, kerb included, so the slab shows round it. */
const BED = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

/** The soil inside the kerb, and the cushion of planting that fills it. */
const SOIL = { x0: 3, x1: 12, z0: 3, z1: 12 } as const;

/** The crown of the cushion, inset again so the mass below it reads as a mound. */
const CUSHION = { x0: 4, x1: 11, z0: 4, z1: 11 } as const;

/**
 * The four clumps of blossom on top of it, as the corner each 2x2 patch starts
 * at, taken red, yellow, yellow, red round the bed.
 *
 * Four patches rather than one flat half-and-half top, which is what this pass
 * first drew and what a render showed it to be: two colours meeting down the
 * middle of a bed reads as a flag, and the bed reads as a layer cake under it.
 * Four clumps on a green cushion read as four flowering plants — and because a
 * clump is 2x2 rather than one voxel, each is a rectangle the mesher takes
 * whole. That is the playground's matting lesson the right way round: a pattern
 * in *blocks* merges, a pattern in cells does not.
 */
const CLUMPS: ReadonlyArray<readonly [number, number, boolean]> = [
  [5, 5, true],
  [9, 5, false],
  [5, 9, false],
  [9, 9, true],
];

export default defineModel({
  id: 'flowerbed',
  label: 'Flower Bed',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, terracotta, teak } = PALETTE;

    plinth(b, SLAB);

    // The kerb: one course of clay under a lighter coping, laid as a ring with
    // the soil inside it, so the edging reads as an edging rather than as the
    // solid clay slab a filled box came out as.
    const coping = GROUND + 1;
    box(BED.x0, BED.x1, GROUND, coping, BED.z0, BED.z1, terracotta.shade);
    box(BED.x0, BED.x1, coping, coping, BED.z0, BED.z1, terracotta.base);
    box(SOIL.x0, SOIL.x1, GROUND, coping, SOIL.z0, SOIL.z1, teak.deep);

    // The planting: two courses of green stepped in on each other, which is
    // what makes a bed a mound rather than a slab with a lid.
    const mass = coping + 1;
    box(SOIL.x0, SOIL.x1, mass, mass, SOIL.z0, SOIL.z1, foliage.shade);
    box(CUSHION.x0, CUSHION.x1, mass + 1, mass + 1, CUSHION.z0, CUSHION.z1, foliage.base);

    // The blossom, as four clumps standing out of the cushion.
    for (const [x, z, red] of CLUMPS) {
      box(x, x + 1, mass + 2, mass + 2, z, z + 1, red ? bloom.base : amber.base);
    }
  },
});
