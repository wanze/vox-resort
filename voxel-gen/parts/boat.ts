/**
 * The two hulls the resort floats: a planked one, and a moulded one.
 *
 * Here rather than in `sea/` for the reason `lantern.ts` is one part rather than
 * three models — and for one more. A rowing boat and a sailing dinghy are the
 * same hull with different things standing in it, so drawn twice they would be
 * two hulls that slowly stopped agreeing about what a boat looks like. And the
 * pedalo is drawn in two registries at once: the ones floating on the bay and
 * the ones drawn up on the sand beside the rental hut are the same craft, so
 * `sea/pedalo.ts` and `models/pedalo-rental.ts` paint it from here.
 *
 * Everything is drawn **bow towards +z**, which is the way a figure faces and
 * the way the flotilla steers — see `features/sea/domain/flotilla.ts`. The
 * waterline is the lowest layer either part paints, so a model's own origin is
 * where the sea surface cuts it: what is below the water is not drawn at all,
 * which is what lets a boat be moved about on a flat sheet without anything
 * having to know how deep it floats.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

/**
 * Half-beam at eight stations from the stern to the bow, as fractions.
 *
 * A written-out drawing rather than a curve, exactly as the lantern's profile
 * is: a boat is widest a little aft of amidships, carries that beam for a third
 * of its length, comes to a point at the bow and finishes on a transom at the
 * stern. Eight numbers are easier to nudge than the equation that would fit
 * them.
 */
const STATIONS = [0.7, 0.9, 1, 1, 0.95, 0.8, 0.55, 0.25] as const;

export interface HullOptions {
  /** The column the keel runs down; the hull is drawn either side of it. */
  readonly x: number;
  /** The transom. The hull runs from here towards +z, which is the bow. */
  readonly z: number;
  /** The waterline: the lowest layer of the hull anybody ever sees. */
  readonly y: number;
  /** Voxels from transom to stem. Sixteen is a 4 m dinghy. */
  readonly length: number;
  /** Voxels of beam either side of the keel. Three is a 1.75 m boat. */
  readonly beam: number;
  readonly timber?: Ramp;
}

/** Half-beam in voxels at one station along a hull of this length and beam. */
function beamAt(o: HullOptions, z: number): number {
  const along = z / Math.max(1, o.length - 1);
  const station = STATIONS[Math.min(STATIONS.length - 1, Math.floor(along * STATIONS.length))]!;
  return Math.max(0, Math.round(o.beam * station));
}

/**
 * A planked open boat: a bottom of wet timber, two strakes of topside, and a
 * lighter gunwale capping them.
 *
 * Four courses, which is a metre of freeboard on a four-metre boat. A course
 * more than a dinghy really carries, and the course is the whole reason the
 * inside of the hull reads as an inside: at three, the floor sits directly under
 * the gunwale and a camera looking down at 30 degrees sees a lid.
 *
 * The bottom course is `deep` on the same grounds `beach-shower.ts` darkens the
 * boards its stream lands on: timber at the waterline is genuinely wet, which is
 * a different material rather than a shadow painted onto a lighter one.
 *
 * Returns the first free layer above the gunwale, which is where a thwart, a
 * mast or an oar goes.
 */
export function hull(b: VoxelBuilder, o: HullOptions): number {
  if (o.length < 4) throw new Error('A hull is at least four voxels long');
  if (o.beam < 1) throw new Error('A hull has at least one voxel of beam');

  const timber = o.timber ?? PALETTE.teak;
  const floor = o.y + 1;
  const rim = o.y + 3;

  for (let along = 0; along < o.length; along++) {
    const half = beamAt(o, along);
    const z = o.z + along;
    const west = o.x - half;
    const east = o.x + half;

    // The bottom, and the floorboards a course above it.
    b.box(west, east, o.y, o.y, z, z, timber.deep);
    b.box(west, east, floor, floor, z, z, timber.shade);

    // The two sides, capped with a lighter gunwale. The transom and the stem
    // are closed across their whole width, so the hull is a box rather than a
    // pair of planks.
    const ends = along === 0 || along === o.length - 1;
    b.box(ends ? west : east, east, floor, rim, z, z, timber.base);
    b.box(west, ends ? east : west, floor, rim, z, z, timber.base);
    b.box(ends ? west : east, east, rim, rim, z, z, timber.light);
    b.box(west, ends ? east : west, rim, rim, z, z, timber.light);
  }
  return rim + 1;
}

/** Voxels a pedalo measures from transom to bow, and either side of its keel. */
export const PEDALO_LENGTH = 12;
export const PEDALO_BEAM = 4;

export interface PedaloOptions {
  /** The column between the two floats; the craft is drawn either side of it. */
  readonly x: number;
  /** The transom. The craft runs from here towards +z. */
  readonly z: number;
  /** The waterline, or the sand it has been drawn up onto. */
  readonly y: number;
  /** The moulded shell. Whitewash unless a craft wants otherwise. */
  readonly shell?: Ramp;
  /** The seats and the stripe, which is what tells one pedalo from the next. */
  readonly trim?: Ramp;
}

/**
 * A pedal boat: two moulded floats with a deck slung between them, two bucket
 * seats side by side and a paddle wheel aft. 9 x 12 voxels, 2.25 x 3 m.
 *
 * Moulded rather than planked, which is the whole difference between this and
 * {@link hull}: a pedalo is a plastic shell, so it is drawn in flat stucco with
 * one stripe of colour and no strakes at all. The stripe is the trim, and it is
 * what makes a rack of them read as a rack of hire boats rather than as one
 * object stamped four times.
 *
 * The seats face +z with the paddle wheel behind them, which is where a pedalo's
 * wheel is and which way whoever is pedalling looks.
 */
export function pedalo(b: VoxelBuilder, o: PedaloOptions): void {
  const shell = o.shell ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.water;
  const { slate } = PALETTE;

  const stern = o.z;
  const bow = o.z + PEDALO_LENGTH - 1;
  const well = o.y + 1;
  const gunwale = o.y + 2;

  // The two floats, two columns wide and three courses deep, with a lighter
  // deck along the top of each. They stand a course proud of the footwell
  // between them, which is what keeps the craft from reading as one flat slab.
  for (const side of [-1, 1] as const) {
    const outer = o.x + side * PEDALO_BEAM;
    const inner = o.x + side * (PEDALO_BEAM - 1);
    const west = Math.min(outer, inner);
    const east = Math.max(outer, inner);
    b.box(west, east, o.y, o.y, stern, bow - 1, shell.shade);
    b.box(west, east, well, gunwale, stern, bow - 1, shell.base);
    b.box(west, east, gunwale, gunwale, stern, bow - 1, shell.light);
    // The stripe down the outside of each float, which is the one colour on it.
    b.box(outer, outer, well, well, stern + 1, bow - 2, trim.base);
    // The nose: the float's outer column stops short and its last station drops
    // a course, so the craft has a stem rather than a square end.
    b.box(inner, inner, o.y, well, bow, bow, shell.light);
  }

  // The footwell between the floats, and the two moulded seats standing in it.
  b.box(o.x - PEDALO_BEAM + 2, o.x + PEDALO_BEAM - 2, o.y, o.y, stern + 2, bow - 1, shell.shade);
  b.box(o.x - PEDALO_BEAM + 2, o.x + PEDALO_BEAM - 2, well, well, stern + 2, bow - 1, shell.light);
  for (const side of [-1, 1] as const) {
    const seat = o.x + side * 2;
    const west = Math.min(seat, seat - side);
    b.box(west, west + 1, gunwale, gunwale, stern + 4, stern + 6, trim.base);
    b.box(west, west + 1, gunwale + 1, gunwale + 2, stern + 3, stern + 3, trim.shade);
  }

  // The paddle wheel in the gap at the stern, standing proud of the floats so it
  // is the thing that tells this apart from a dinghy from any angle.
  b.box(o.x - 1, o.x + 1, well, gunwale + 1, stern, stern + 1, slate.shade);
  b.box(o.x - 2, o.x + 2, gunwale, gunwale, stern, stern + 1, slate.light);
}
