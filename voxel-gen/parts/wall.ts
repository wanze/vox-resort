/**
 * Walls and the holes in them.
 *
 * The lane's buildings are all the same three moves: a whitewashed body with a
 * stone skirting, openings cut one voxel into it so the reveal throws its own
 * shadow, and shutters flush with the render. Written once here, every building
 * makes those moves the same way, which is most of what "one style" means.
 *
 * Bodies are painted solid. It is tempting to hollow a large building out, but
 * the mesher only culls faces between two solid voxels: a cavity gets its own
 * inside surface, so hollowing roughly doubles a building's triangles while
 * saving voxels nobody has to draw.
 */

import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

/** Which side of a building a part sits on. */
export type Face = 'x-' | 'x+' | 'z-' | 'z+';

/** A storey is 3 m: twelve voxels, the height the whole catalogue is drawn at. */
export const STOREY_VOXELS = 12;

/**
 * The glass a building declares as its windows.
 *
 * It is exactly what {@link shutteredWindow} fills a recess with, written down
 * once so that a building says `windows: WINDOW_GLASS` rather than repeating a
 * ramp step the part it called already chose. A model that glazes by hand, or
 * with a ramp of its own, declares its own colours instead.
 *
 * Only `base`. The other steps of the glass ramp are used for things with no
 * room behind them — a vent slot, a shopfront door leaf, a water flume — and a
 * light burning in one of those is a light burning in a wall.
 */
export const WINDOW_GLASS: readonly Color[] = [PALETTE.glass.base];

/**
 * Paints one cell of a face, in the face's own two dimensions.
 *
 * `at` is where the wall's outer surface sits on the face's own axis, `along`
 * runs across the face, and `depth` counts inwards from the surface — so every
 * part below is written once and works on all four sides.
 */
function faceCell(
  b: VoxelBuilder,
  face: Face,
  at: number,
  along: number,
  y: number,
  depth: number,
  color: Color | null,
): void {
  const inward = face === 'x+' || face === 'z+' ? -depth : depth;
  const x = face === 'x-' || face === 'x+' ? at + inward : along;
  const z = face === 'z-' || face === 'z+' ? at + inward : along;
  if (color === null) b.del(x, y, z);
  else b.set(x, y, z, color);
}

export interface WallOptions {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  /** Lowest wall layer, normally what `plinth` handed back. */
  readonly y: number;
  readonly storeys: number;
  readonly wall?: Ramp;
  /** The stone the skirting course is laid in. */
  readonly trim?: Ramp;
  /** Layers of stone at the foot of the wall. Two is 50 cm. */
  readonly skirting?: number;
  /** Lightened corner columns. Off for a building that wants a plain box. */
  readonly quoins?: boolean;
}

/**
 * A rendered building body: skirting at the foot, a string course between
 * storeys, quoins at the corners and a cornice under the eaves.
 *
 * Returns the first free layer above the cornice, which is where a roof goes.
 */
export function stuccoWall(b: VoxelBuilder, o: WallOptions): number {
  if (o.storeys < 1) throw new Error('A wall has at least one storey');
  if (o.w < 3 || o.d < 3) throw new Error('A wall is at least 3 voxels a side');

  const wall = o.wall ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.stone;
  const skirting = o.skirting ?? 2;
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;
  const top = o.y + o.storeys * STOREY_VOXELS - 1;

  b.box(o.x, x1, o.y, top, o.z, z1, wall.base);
  if (skirting > 0) b.box(o.x, x1, o.y, o.y + skirting - 1, o.z, z1, trim.base);
  for (let storey = 1; storey < o.storeys; storey++) {
    const band = o.y + storey * STOREY_VOXELS - 1;
    b.box(o.x, x1, band, band, o.z, z1, wall.light);
  }
  if (o.quoins ?? true) {
    for (const [x, z] of [
      [o.x, o.z],
      [x1, o.z],
      [o.x, z1],
      [x1, z1],
    ] as const) {
      b.box(x, x, o.y, top, z, z, wall.light);
    }
  }
  b.box(o.x, x1, top + 1, top + 1, o.z, z1, wall.light);
  return top + 2;
}

/**
 * Cuts an opening a voxel into the wall and fills it a voxel deeper, which is
 * what a window and a door have in common: the reveal left round the hole is
 * where the depth comes from, and the scene's own light does the rest.
 */
function recess(
  b: VoxelBuilder,
  face: Face,
  at: number,
  along: number,
  y: number,
  w: number,
  h: number,
  fill: Color,
): void {
  for (let column = along; column < along + w; column++) {
    for (let layer = y; layer < y + h; layer++) {
      faceCell(b, face, at, column, layer, 0, null);
      faceCell(b, face, at, column, layer, 1, fill);
    }
  }
}

export interface OpeningOptions {
  readonly face: Face;
  /** Where the wall's outer surface sits on the face's own axis. */
  readonly at: number;
  /** Where the opening starts across the face. */
  readonly along: number;
  /** Lowest layer of the opening. */
  readonly y: number;
  /** Width across the face. */
  readonly w?: number;
  /** Height. Five voxels is a 1.25 m window, nine a 2.25 m door. */
  readonly h?: number;
  readonly trim?: Ramp;
}

export interface WindowOptions extends OpeningOptions {
  readonly glass?: Ramp;
  readonly timber?: Ramp;
  /** Shutters either side. Off where the wall has no room for them. */
  readonly shutters?: boolean;
}

/**
 * A window recessed one voxel into a wall, with a sill and a lintel and a
 * shutter folded back either side of it.
 *
 * The recess is the point: a flat pane painted onto a wall reads as a sticker
 * from every angle, and one voxel of reveal is enough for the scene's own light
 * to darken the head and one jamb.
 */
export function shutteredWindow(b: VoxelBuilder, o: WindowOptions): void {
  const w = o.w ?? 3;
  const h = o.h ?? 5;
  const trim = o.trim ?? PALETTE.stone;
  const glass = o.glass ?? PALETTE.glass;
  const timber = o.timber ?? PALETTE.teak;

  recess(b, o.face, o.at, o.along, o.y, w, h, glass.base);
  for (let along = o.along - 1; along <= o.along + w; along++) {
    faceCell(b, o.face, o.at, along, o.y - 1, 0, trim.light);
    faceCell(b, o.face, o.at, along, o.y + h, 0, trim.light);
  }
  if (o.shutters ?? true) {
    for (let y = o.y; y < o.y + h; y++) {
      faceCell(b, o.face, o.at, o.along - 1, y, 0, timber.base);
      faceCell(b, o.face, o.at, o.along + w, y, 0, timber.base);
    }
  }
}

export interface DoorwayOptions extends OpeningOptions {
  readonly timber?: Ramp;
}

/** A door leaf recessed into a stone frame, drawn the same way a window is. */
export function doorway(b: VoxelBuilder, o: DoorwayOptions): void {
  const w = o.w ?? 4;
  const h = o.h ?? 9;
  const trim = o.trim ?? PALETTE.stone;
  const timber = o.timber ?? PALETTE.teak;

  recess(b, o.face, o.at, o.along, o.y, w, h, timber.deep);
  for (let y = o.y; y < o.y + h; y++) {
    faceCell(b, o.face, o.at, o.along - 1, y, 0, trim.light);
    faceCell(b, o.face, o.at, o.along + w, y, 0, trim.light);
  }
  for (let along = o.along - 1; along <= o.along + w; along++) {
    faceCell(b, o.face, o.at, along, o.y + h, 0, trim.light);
  }
}

export interface AwningOptions {
  readonly face: Face;
  /** Where the wall's outer surface sits on the face's own axis. */
  readonly at: number;
  /** Where the run starts across the face. */
  readonly along: number;
  /** Length across the face. */
  readonly w: number;
  /** The layer the canopy lies in. */
  readonly y: number;
  /** Voxels the canopy stands out from the wall. Four is a metre of shade. */
  readonly reach?: number;
  /** Layers of valance hanging under the brink. Two is 50 cm. */
  readonly drop?: number;
  readonly canvas?: Ramp;
}

/**
 * A shop blind: one flat plane of canvas cantilevered off a wall, with a
 * valance hanging at its brink.
 *
 * `docs/art-direction.md` has wanted this since the first pass and the
 * supermarket is the model that asked for it. The check that list asks for
 * first — whether one of the parts that exist is already this in another
 * material — comes back no. `flatRoof` is the near miss: it lays a slab and it
 * would take `PALETTE.bloom`, but it oversails a footprint by the same
 * overhang on all four sides, where an awning stands out from exactly one, and
 * the lip it can draw is a parapet standing up round the edge rather than a
 * valance hanging under one. The valance is not decoration: a canopy one voxel
 * thick, seen from a camera looking down at 30 degrees, is a coloured rectangle
 * lying on the air, and the drop at its brink is the whole of what makes it
 * read as canvas over a shopfront.
 *
 * Both surfaces are single flat planes, which is the point of drawing it here
 * rather than by hand. The awning this replaces striped its front lip
 * `x % 2` over 62 voxels — 62 quads where a plane is one, and the one pattern
 * the mesher cannot merge. A striped blind is what the reference has and what
 * this grid cannot hold: at 25 cm a voxel, a stripe is the noise in
 * `docs/art-direction.md`'s first table.
 *
 * Reach is deliberately short by default. A blind is the one thing on a
 * shopfront that stands between the camera and the elevation the pass was for,
 * and every voxel it reaches out hides rather more than half a voxel of the
 * wall under it at the angle the resort is seen from — which is the pergola
 * lesson read forwards, and the reason this is drawn over the produce rather
 * than over the glazing.
 */
export function awning(b: VoxelBuilder, o: AwningOptions): void {
  const reach = o.reach ?? 4;
  const drop = o.drop ?? 2;
  if (o.w < 1) throw new Error('An awning is at least one voxel long');
  if (reach < 1) throw new Error('An awning reaches at least one voxel past its wall');
  if (drop < 0) throw new Error('An awning hangs no less than nothing');

  const canvas = o.canvas ?? PALETTE.bloom;
  for (let along = o.along; along < o.along + o.w; along++) {
    // Negative depth is outwards, which is what `faceCell` counts inwards from:
    // the canopy starts one voxel clear of the wall rather than repainting it.
    for (let out = 1; out <= reach; out++) {
      faceCell(b, o.face, o.at, along, o.y, -out, canvas.base);
    }
    for (let layer = o.y - drop; layer < o.y; layer++) {
      faceCell(b, o.face, o.at, along, layer, -reach, canvas.shade);
    }
  }
}
