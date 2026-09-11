/**
 * Neatly trimmed hedge: a clipped block of foliage with a lighter course of new
 * growth across its top, on a low paving slab. 16x16x7 (3 m of run, 1.25 m
 * tall), a 1x1 tile.
 *
 * **Still deliberately plain, and the reason is the placement count.** Hedges
 * line every path the layout draws — the authored plan stands 570 of them, and a
 * generated 160-tile plot around 1 100 — so this is the one model in the
 * catalogue where a single extra quad is a four-figure number on the frame.
 * Three earlier attempts at detail were all given back: a stippled top and
 * diagonally striped flanks came to 452 triangles for texture invisible past a
 * few metres, and a crown of raised leaf clumps to 156 for a shape that read as
 * studs.
 *
 * What this pass changes is therefore not detail but the two things that are
 * free. The colour comes off `PALETTE.foliage` instead of a green private to
 * this file, so a hedge run, a potted palm and the boundary of the mini-golf
 * course are the same plant. And the block is drawn in two courses rather than
 * one: `shade` for the flanks, `base` for the top layer. A hedge is read from
 * 30 degrees above, where its top face is most of what you see of it, and a
 * lighter crown over darker sides is what a clipped hedge actually looks like —
 * the new growth is on top. Because the crown is the *full width* of the block
 * the mesher merges each flank into two rectangles rather than many, so the
 * whole change is four quads: 52 triangles against the plain block's 44.
 *
 * It is also a little smaller, as asked: five courses of foliage instead of six,
 * which takes the run from 1.5 m to 1.25 m and lets the street lamps and the
 * benches beside it read over the top. The **width stays at 12 of the 16**,
 * because that is not dressing — the layout fills the straight runs between its
 * lamps with these, so neighbouring tiles have to join into a hedge rather than
 * into a row of bushes.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/**
 * The slab, which is the whole tile: a model fills the footprint it claims.
 *
 * Two layers rather than the catalogue's three, for the reason the bench's is:
 * `PAVING_VOXELS` is two, and a hedge stands at the edge of a path, so a
 * three-layer plinth would be a step up out of the pavement beside it.
 *
 * In `sand` rather than the `plinth` part's default `stone`, which is the one
 * thing this model does not share with the buildings. A hedge is never on a
 * plot: the layout scatters it along the walks, shoulder to shoulder with the
 * street lamps and the trees — and every one of those stands on `0xcdb98f` with
 * a `0xb5a274` lip, the legacy sandy pair that `path` is paved in
 * (`0xc3b189`, `0xb6a379`, `0xcdbc95`). `stone` is a grey-beige, so 570 hedges
 * on a sand-coloured path network read as 570 grey tiles dropped into it.
 * `sand.base` over a `sand.shade` lip is the palette's name for what the trees
 * and lamps are already doing, and it is within 26 of their colour on the
 * channel sum where `stone.base` is 86 away.
 *
 * The rest of the catalogue is right to keep `stone`: a plinth under a building
 * is the plot the building stands on, and a plot is paved, not sanded.
 */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the foliage starts. */
const GROUND = SLAB.height;

/** The block: 12 of the 16 voxels across, so two neighbours read as one run. */
const BLOCK = { x0: 2, x1: 13, z0: 2, z1: 13 } as const;

/** Courses of foliage. Five is 1.25 m, low enough to see a bench over. */
const COURSES = 5;

export default defineModel({
  id: 'hedge',
  label: 'Hedge',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage } = PALETTE;

    plinth(b, SLAB);

    // The flanks, and the clipped top over them. Two boxes, one width: the
    // crown is the last course rather than an inset cap, so nothing steps in
    // and the mesher keeps every side to two rectangles.
    const top = GROUND + COURSES - 1;
    box(BLOCK.x0, BLOCK.x1, GROUND, top - 1, BLOCK.z0, BLOCK.z1, foliage.shade);
    box(BLOCK.x0, BLOCK.x1, top, top, BLOCK.z0, BLOCK.z1, foliage.base);
  },
});
