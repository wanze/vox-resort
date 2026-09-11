/**
 * Where the resort can be sat on, worked out once per plot.
 *
 * A seat is declared by the art — a bench knows where its own plank is, see
 * `ModelSeat` in `voxel-gen/voxelgen.ts` — and what this module does is the one
 * step between that and a person: it takes every object standing on the plot
 * and turns the seats it carries into points in the world, facing the way the
 * turned object faces.
 *
 * It is the same journey a lamp makes, and deliberately so: `showcase.ts` turns
 * a model's lights with `rotateLights` and splats them where the placement put
 * them, and a seat is that with a heading on the end. Two things follow from
 * putting it here rather than in the scene.
 *
 * **The turn is measured against the model, not the placement.** A placement's
 * extent is already turned, so turning a seat against it sends the sitter out
 * of the chair it was declared in — the note `lightsOf` carries, for the same
 * reason.
 *
 * **A seat is a point, not a tile.** It comes out in continuous world voxels,
 * centred on the column the art named, because a person sits *on the plank* and
 * the plank is four voxels wide. Nothing downstream rounds it to a tile.
 */

import { TILE_VOXELS, type ModelSeat } from '../../../../voxel-gen/voxelgen.ts';
import { rotateSeats, rotationRadians, type Rotation } from '../../layout/domain/rotation';

/**
 * An object standing on the plot, as far as its seats are concerned.
 *
 * Deliberately narrower than `Placement`: what a seat needs of an object is
 * where its model's corner is, how high it stands and which way round it is —
 * and `width`/`depth` are the model's **own** size, before the turn, because
 * that is the box the seats were measured against. A `Placement` satisfies this
 * only with the model's size passed alongside it, which is what `showcase.ts`
 * does and what keeps this module free of the catalogue.
 */
export interface SeatSite {
  /** World-space corner of the model itself, in voxels. */
  readonly x: number;
  readonly z: number;
  /** Height the object stands at: the surface of its terrace, in voxels. */
  readonly y: number;
  readonly rotation: Rotation;
  /** The model's size before the turn, which the seats are measured against. */
  readonly width: number;
  readonly depth: number;
  /** The seats the model declares, in its own coordinates. */
  readonly seats: readonly ModelSeat[];
}

/** One place a person may sit, in the world. */
export interface SeatSpot {
  /** Where the sitter's body is, in world voxels; the centre of its column. */
  readonly x: number;
  readonly z: number;
  /** The layer the sitter's hips rest on. */
  readonly y: number;
  /** Which way they look, in radians about Y — the crowd's own convention. */
  readonly heading: number;
  /** The tile the seat stands on, which is how the network finds its paving. */
  readonly tileX: number;
  readonly tileZ: number;
}

/**
 * Every seat the objects on a plot offer, in the order the objects came in.
 *
 * Half a voxel is added on both ground axes because a voxel column is a box and
 * a person stands in the middle of one: without it a figure three voxels across
 * sits half a voxel off its own plank, which at 25 cm a voxel is 12 cm and reads
 * as a person perched on the arm.
 */
export function seatSpotsFor(sites: readonly SeatSite[]): SeatSpot[] {
  const spots: SeatSpot[] = [];
  for (const site of sites) {
    if (site.seats.length === 0) continue;
    for (const seat of rotateSeats(site.seats, site.width, site.depth, site.rotation)) {
      const x = site.x + seat.x + 0.5;
      const z = site.z + seat.z + 0.5;
      spots.push({
        x,
        z,
        y: site.y + seat.y,
        heading: rotationRadians(seat.facing),
        tileX: Math.floor(x / TILE_VOXELS),
        tileZ: Math.floor(z / TILE_VOXELS),
      });
    }
  }
  return spots;
}
