import { PALETTE, type Ramp } from '../palette.ts';
import type { Color, VoxelBuilder } from '../voxelgen.ts';

export type Face = 'x-' | 'x+' | 'z-' | 'z+';

export const STOREY_VOXELS = 12;

// Only base: the other glass steps are vents, door leaves and flumes, where a
// lit window would be a light burning in a wall.
export const WINDOW_GLASS: readonly Color[] = [PALETTE.glass.base];

// `depth` counts inwards from the wall's outer surface.
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
  readonly y: number;
  readonly storeys: number;
  readonly wall?: Ramp;
  readonly trim?: Ramp;
  readonly skirting?: number;
  readonly quoins?: boolean;
}

export function stuccoWall(b: VoxelBuilder, o: WallOptions): number {
  if (o.storeys < 1) throw new Error('A wall has at least one storey');
  if (o.w < 3 || o.d < 3) throw new Error('A wall is at least 3 voxels a side');

  const wall = o.wall ?? PALETTE.stucco;
  const trim = o.trim ?? PALETTE.stone;
  const skirting = o.skirting ?? 2;
  const x1 = o.x + o.w - 1;
  const z1 = o.z + o.d - 1;
  const top = o.y + o.storeys * STOREY_VOXELS - 1;

  // Solid, never hollowed: a cavity gets its own inside faces and doubles the triangles.
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

// One voxel of reveal round the hole is what lets the scene's light give it depth.
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
  readonly at: number;
  readonly along: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly trim?: Ramp;
}

export interface WindowOptions extends OpeningOptions {
  readonly glass?: Ramp;
  readonly timber?: Ramp;
  readonly shutters?: boolean;
}

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
  readonly at: number;
  readonly along: number;
  readonly w: number;
  readonly y: number;
  readonly reach?: number;
  readonly drop?: number;
  readonly canvas?: Ramp;
}

// One flat plane plus a valance: stripes defeat the mesher, and without the drop a
// one-voxel canopy reads as a rectangle floating in the air from above.
export function awning(b: VoxelBuilder, o: AwningOptions): void {
  const reach = o.reach ?? 4;
  const drop = o.drop ?? 2;
  if (o.w < 1) throw new Error('An awning is at least one voxel long');
  if (reach < 1) throw new Error('An awning reaches at least one voxel past its wall');
  if (drop < 0) throw new Error('An awning hangs no less than nothing');

  const canvas = o.canvas ?? PALETTE.bloom;
  for (let along = o.along; along < o.along + o.w; along++) {
    // Negative depth is outwards: the canopy starts a voxel clear of the wall.
    for (let out = 1; out <= reach; out++) {
      faceCell(b, o.face, o.at, along, o.y, -out, canvas.base);
    }
    for (let layer = o.y - drop; layer < o.y; layer++) {
      faceCell(b, o.face, o.at, along, layer, -reach, canvas.shade);
    }
  }
}
