/**
 * The open-air edge of a building: the colonnade a veranda roof stands on, and
 * the run of balusters that fences the terrace, the balcony or the roof deck
 * behind it.
 *
 * Both are the lane's answer to the same problem. A whitewashed box on a slab
 * has nothing between the wall and the sky, so it reads as a box; the reference
 * villa has an arcaded veranda under a first-floor terrace, and the terrace is
 * edged rather than left as a cliff. That silhouette is most of what makes the
 * reference look like a villa rather than like a house with a bigger footprint.
 *
 * Both parts are also where the dithering rule earns its keep. An arch and a
 * baluster are *geometry* — a hole carved through masonry, a gap between two
 * posts — so they cost real quads and read from every angle. Painting either of
 * them onto a flat wall would cost the same quads and read from one.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

/** The axis a run of piers or balusters is laid along. */
export type Run = 'x' | 'z';

export interface ArcadeOptions {
  readonly x: number;
  readonly z: number;
  /** Extent on x: the length of the run when `along` is `'x'`, else the depth. */
  readonly w: number;
  /** Extent on z: the depth of the piers when `along` is `'x'`, else the length. */
  readonly d: number;
  /** Lowest layer, normally what `plinth` handed back. */
  readonly y: number;
  readonly along: Run;
  /** Openings in the run. An odd count puts a bay on the centre line. */
  readonly bays: number;
  /** Width of every pier, the two end ones included. Three voxels is 75 cm. */
  readonly pier?: number;
  /** Clear layers under the springing line. Eight is 2 m to the impost. */
  readonly height?: number;
  /** Layers the arch head rises above the springing. Defaults to a third of a bay. */
  readonly rise?: number;
  readonly wall?: Ramp;
  /** The stone the skirting and the impost band are laid in. */
  readonly trim?: Ramp;
  /** Layers of stone at the foot of each pier. Two is 50 cm. */
  readonly skirting?: number;
}

/** The first and last column of one bay, along the run. */
type Bay = readonly [number, number];

/**
 * Where each bay of a run of `bays` openings starts and ends, in columns from
 * the start of the run.
 *
 * Every pier comes out exactly `pier` wide, the two end ones included, and the
 * bays absorb whatever the division leaves over: a bay a voxel wider than its
 * neighbour does not show on a whitewashed elevation, and a pier a voxel thinner
 * than its neighbour does.
 */
function baySpans(length: number, pier: number, bays: number): readonly Bay[] {
  const pitch = (length - pier) / bays;
  if (Math.round(pitch) - pier < 1) {
    throw new Error(`An arcade ${length} long has no room for ${bays} bays past its piers`);
  }
  return Array.from({ length: bays }, (_, bay): Bay => [
    Math.round(bay * pitch) + pier,
    Math.round((bay + 1) * pitch) - 1,
  ]);
}

/**
 * Clears one bay out of the slab: a rectangular opening up to the springing,
 * then a head that closes over it.
 *
 * The head is a half ellipse springing from the impost and closing half a course
 * into the crown, sampled at the top edge of each course it passes through, so
 * it narrows slowly off the impost and fast under the crown. A head stepped in a
 * voxel a course would read as a little gable instead.
 */
function carveBay(
  clear: (column: number, y: number) => void,
  [from, to]: Bay,
  y: number,
  springing: number,
  rise: number,
): void {
  const half = (to - from + 1) / 2;
  const centre = from + half;
  for (let column = from; column <= to; column++) {
    for (let layer = y; layer < springing; layer++) clear(column, layer);
  }
  for (let course = 0; course < rise; course++) {
    const halfWidth = half * Math.sqrt(1 - ((course + 1) / (rise + 0.5)) ** 2);
    for (let column = from; column <= to; column++) {
      if (Math.abs(column + 0.5 - centre) < halfWidth) clear(column, springing + course);
    }
  }
}

/**
 * A run of piers with round-headed arches sprung between them, under a cornice.
 *
 * Drawn as a solid slab with the bays carved out of it, which is what leaves the
 * spandrel standing between two neighbouring arches — the same move
 * `shutteredWindow` makes, at the scale of a whole elevation.
 *
 * Returns the first free layer above the cornice, which is where the veranda
 * roof the arcade carries goes.
 */
export function arcade(b: VoxelBuilder, o: ArcadeOptions): number {
  const alongX = o.along === 'x';
  const length = alongX ? o.w : o.d;
  const across = alongX ? o.d : o.w;
  const pier = o.pier ?? 3;
  const height = o.height ?? 8;
  if (o.bays < 1) throw new Error('An arcade has at least one bay');
  if (pier < 1) throw new Error('An arcade stands on piers at least one voxel wide');
  if (across < 1) throw new Error('An arcade is at least one voxel deep');
  if (height < 1) throw new Error('An arcade has at least one clear layer under its arches');

  const bays = baySpans(length, pier, o.bays);
  const [from, to] = bays[0]!;
  // A bay only has as many widths as it has voxels: a five-voxel opening can
  // narrow to three and then to one, and nothing between. So the rise is a third
  // of the bay rather than the half a drawn semicircle would want — rising
  // further buys a course that repeats the width below it, which reads as a
  // stilted arch rather than as a rounder one.
  const rise = o.rise ?? Math.max(1, Math.floor((to - from + 2) / 3));

  const wall = o.wall ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.stone;
  const skirting = o.skirting ?? 2;
  const runOrigin = alongX ? o.x : o.z;
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;
  /** First layer of the arch head; the impost band is the course under it. */
  const springing = o.y + height;
  /** The solid course closing the arches, which is what the cornice sits on. */
  const crown = springing + rise;

  /** Paints one course right across the run, before anything is carved out. */
  const course = (y: number, color: Color): void => b.box(o.x, x1, y, y, o.z, z1, color);

  /** Clears one column of the run, right through the arcade's depth. */
  const clear = (column: number, y: number): void => {
    for (let cross = 0; cross < across; cross++) {
      const x = alongX ? runOrigin + column : o.x + cross;
      const z = alongX ? o.z + cross : runOrigin + column;
      b.del(x, y, z);
    }
  };

  b.box(o.x, x1, o.y, crown, o.z, z1, wall.base);
  for (let layer = o.y; layer < o.y + skirting; layer++) course(layer, trim.base);
  course(springing - 1, trim.light);
  for (const bay of bays) carveBay(clear, bay, o.y, springing, rise);
  course(crown + 1, wall.light);
  return crown + 2;
}

export interface BalustradeOptions {
  readonly x: number;
  readonly z: number;
  /** Lowest layer: the surface the run stands on. */
  readonly y: number;
  /** Length along `along`. */
  readonly w: number;
  /** The axis the run is laid along. */
  readonly along: Run;
  /** Voxels across the other axis. One is 25 cm, which is a rail. */
  readonly depth?: number;
  /** Layers, coping included. Four is a 1 m rail, the height a rail is. */
  readonly height?: number;
  /** Voxels from one baluster to the next. Two is baluster, gap, baluster. */
  readonly pitch?: number;
  /** What the run is turned from: stone for a terrace, teak for a deck. */
  readonly rail?: Ramp;
}

/**
 * A run of balusters between a bottom rail and a coping.
 *
 * The gaps are real, which is the point: the eye reads a fence by seeing
 * through it, and a solid parapet of the same height reads as a wall the terrace
 * is sunk behind. `pitch` is what that costs — every baluster is four quads the
 * mesher cannot merge into its neighbour — so a run that will stand on a
 * building placed many times wants a wider pitch than one that will not.
 */
export function balustrade(b: VoxelBuilder, o: BalustradeOptions): void {
  const height = o.height ?? 4;
  const depth = o.depth ?? 1;
  const pitch = o.pitch ?? 2;
  if (o.w < 1) throw new Error('A balustrade is at least one voxel long');
  if (depth < 1) throw new Error('A balustrade is at least one voxel deep');
  if (height < 3) throw new Error('A balustrade is a rail, a baluster and a coping: three layers');
  if (pitch < 1) throw new Error('A balustrade sets its balusters at least a voxel apart');

  const rail = o.rail ?? PALETTE.stone;
  const top = o.y + height - 1;

  const paint = (step: number, y0: number, y1: number, color: Color): void => {
    for (let cross = 0; cross < depth; cross++) {
      const x = o.along === 'x' ? o.x + step : o.x + cross;
      const z = o.along === 'z' ? o.z + step : o.z + cross;
      b.box(x, x, y0, y1, z, z, color);
    }
  };

  for (let step = 0; step < o.w; step++) {
    paint(step, o.y, o.y, rail.shade);
    paint(step, top, top, rail.light);
    // A baluster at each end whatever the pitch works out to, so the run is
    // closed by a post rather than trailing off into a gap.
    if (step % pitch === 0 || step === o.w - 1) paint(step, o.y + 1, top - 1, rail.base);
  }
}
