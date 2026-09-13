/**
 * The marker buoy: an amber drum with a red band, a mast over it and a lamp on
 * top. 5 x 13 x 5 voxels, and the whole of it is above the waterline.
 *
 * What it is for is the line of them rather than the one: a swimming area is
 * marked by buoys strung parallel to the shore, and the line is what tells a
 * swimmer where the boats start. See `features/sea/domain/swimArea.ts`, which
 * moors them, and `sea/index.ts` for why the buoy is declared first.
 *
 * **Drawn three metres tall, which is twice what a real one is.** The same
 * bargain `lantern.ts` strikes and for the same reason: a buoy fifty metres out
 * from a camera at 30 degrees is a handful of pixels, and one drawn to scale is
 * one nobody sees. The drum is the part that has to read, so it is the part that
 * was given the height.
 *
 * **The lamp glows, and lights the water round it.** A buoy is a navigation
 * mark, so it is lit after dark. The glow is a declared `emissive`, split into
 * the geometry the whole scene shares one unlit material for; the light is a
 * declared `lights` entry, which the app bakes at every mooring the way it bakes
 * a street lamp at its post. A buoy never leaves its mooring, so the lamp is as
 * static as the bake needs it to be. See `features/sea/domain/buoyLamps.ts`.
 *
 * The light is declared at the middle of the lamp voxel rather than on a voxel
 * corner, because a buoy is drawn hung on its own middle and the bake puts the
 * light back exactly there.
 */

import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The lamp on the mast head, and the colour it is drawn unlit in. */
const LAMP = PALETTE.amber.light;

/** Layers of drum, mast and mark. Thirteen voxels is a little over 3 m. */
const DRUM = 4;
const MAST = 6;

export default defineModel({
  id: 'buoy',
  label: 'Marker Buoy',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  emissive: [LAMP],
  // Brighter than a bridge lantern for the height it burns at: the water it
  // lights is ten voxels under the lamp rather than a railing's few.
  lights: [{ x: 0.5, y: DRUM + MAST + 0.5, z: 0.5, color: LAMP, intensity: 40, distance: 32 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, metal } = PALETTE;

    // The drum, drawn in from the waterline and in again at the shoulder, so it
    // reads as a barrel rather than as a post. The red band round its middle is
    // what a marker buoy is: one stripe of a second colour at eye height.
    box(-1, 1, 0, 0, -1, 1, amber.shade);
    box(-2, 2, 1, DRUM - 1, -2, 2, amber.base);
    box(-2, 2, 2, 2, -2, 2, bloom.base);
    box(-1, 1, DRUM, DRUM, -1, 1, amber.light);

    // The mast, and the ring of a topmark under the lamp: the one detail that
    // tells this apart from a mooring float at any distance.
    const head = DRUM + MAST;
    box(0, 0, DRUM + 1, head - 1, 0, 0, metal.light);
    box(-1, 1, head - 2, head - 2, 0, 0, bloom.base);
    box(0, 0, head - 2, head - 2, -1, 1, bloom.base);

    // The lamp on the head of the mast.
    b.set(0, head, 0, LAMP);
  },
});
