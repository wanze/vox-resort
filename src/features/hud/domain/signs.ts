import type { ModelDoor, SignKind } from '../../../../voxel-gen/voxelgen.ts';
import type { Venue } from '../../sim/domain/venues';
import { roofOver, type Anchor, type Footprint } from './staffPins';

// One storey: over the lintel of a doorway, under the eaves of most roofs.
export const DOOR_SIGN_RISE = 14;
// Hysteresis, so a zoom resting on the threshold does not blink the signs on and off.
export const SIGN_MIN_TILE_PX = 20;
export const SIGN_HIDE_TILE_PX = 16;
// The showcase preallocates its anchor buffers and the HUD its nodes to this count.
export const MAX_SIGNS = 160;

export interface SignFootprint extends Footprint {
  readonly doors: readonly ModelDoor[];
}

export interface SignSpot extends Footprint {
  readonly key: string;
  readonly sign: SignKind;
  readonly label: string;
}

// Indexed by facing: +z, +x, -z, -x, as in doorStep.ts.
const OUTWARD = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

// From the middle of the door's column half a voxel back, so the pin stands on the wall rather
// than out in the street.
export function signAnchorOf(venue: SignFootprint, ground: number, height: number): Anchor {
  const door = venue.doors[0];
  if (!door) return roofOver(venue, ground, height);
  const [dx, dz] = OUTWARD[door.facing];
  return {
    x: door.x + 0.5 - dx / 2,
    y: ground + Math.min(height, DOOR_SIGN_RISE),
    z: door.z + 0.5 - dz / 2,
  };
}

export function signsShown(tilePx: number, wasShown: boolean): boolean {
  if (tilePx >= SIGN_MIN_TILE_PX) return true;
  if (tilePx < SIGN_HIDE_TILE_PX) return false;
  return wasShown;
}

export function signSpotsOf(
  venues: readonly Venue[],
  signOf: (id: string) => SignKind | null,
): readonly SignSpot[] {
  const spots: SignSpot[] = [];
  for (const venue of venues) {
    if (spots.length === MAX_SIGNS) break;
    const sign = signOf(venue.id);
    if (sign === null) continue;
    const { key, label, tileX, tileZ, tilesX, tilesZ } = venue;
    spots.push({ key, sign, label, tileX, tileZ, tilesX, tilesZ });
  }
  return spots;
}

// The keys of the signs a problem marker stands over: there the problem reads first.
export function signsUnder(
  spots: readonly SignSpot[],
  marked: readonly { readonly tileX: number; readonly tileZ: number }[],
): ReadonlySet<string> {
  const under = new Set<string>();
  for (const spot of spots) {
    const covered = marked.some(
      ({ tileX, tileZ }) =>
        tileX >= spot.tileX &&
        tileX < spot.tileX + spot.tilesX &&
        tileZ >= spot.tileZ &&
        tileZ < spot.tileZ + spot.tilesZ,
    );
    if (covered) under.add(spot.key);
  }
  return under;
}
