import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { GUEST_FRAMING } from '../../guest-view/domain/followRig';
import type { Placement } from '../../layout/domain/resortLayout';

// Full value up to the width of a plateau's dune and beach on the reference resort; the view
// fades out over the next stretch, as the sea becomes a strip on the horizon.
const SEA_NEAR = 36;
const SEA_FAR = 72;

// Straight out to sea and the two diagonals: one palm in the way spoils a third of the view.
const RAYS = [0, 1, -1] as const;

// The ground within this many tiles a guest looks down on: from the edge of a plateau, past a
// dune of three steps three tiles deep, to the beach.
const OVERLOOK_REACH = 12;

// A dune of four levels, or the edge of a plateau above the beach, overlooks as much as it gets.
const OVERLOOK_FULL = 4;

// Far enough to see past one step of a dune, which is three tiles deep.
const SLOPE_REACH = 3;

export interface Outlook {
  // How much of the sea is in view across open ground, 0 for none.
  readonly horizon: Float32Array;
  // Along the clearest line to the sea, NaN with none.
  readonly horizonHeading: Float32Array;
  // How far the tile stands above the ground around it, 0 on the flat, 1 on a dune top.
  readonly overlook: Float32Array;
  // Down the slope, NaN on the flat.
  readonly downhill: Float32Array;
}

export interface OutlookParts {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly levelOf: (tileX: number, tileZ: number) => number;
  readonly isSea: (tileX: number, tileZ: number) => boolean;
  readonly standing: readonly Placement[];
  readonly topOf: (id: string) => number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// Asked of the terrain once per tile: its answers cost a lookup each, and the sweeps below ask
// some twenty times per tile. The sea has one row more, beyond the plot, where a ray ends.
interface Ground {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly levels: Float32Array;
  readonly sea: Uint8Array;
}

function groundOf(parts: OutlookParts): Ground {
  const { tilesX, tilesZ } = parts;
  const levels = new Float32Array(tilesX * tilesZ);
  const sea = new Uint8Array(tilesX * (tilesZ + 1));
  for (let z = 0; z <= tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      if (z < tilesZ) levels[z * tilesX + x] = parts.levelOf(x, z);
      sea[z * tilesX + x] = parts.isSea(x, z) ? 1 : 0;
    }
  }
  return { tilesX, tilesZ, levels, sea };
}

// Clamped into the plot: the apron beyond it is scenery nobody stands on.
const levelAt = (ground: Ground, tileX: number, tileZ: number): number =>
  ground.levels[
    Math.min(ground.tilesZ - 1, Math.max(0, tileZ)) * ground.tilesX +
      Math.min(ground.tilesX - 1, Math.max(0, tileX))
  ]!;

const fadeWith = (distance: number): number => clamp01((SEA_FAR - distance) / (SEA_FAR - SEA_NEAR));

// In voxels above level 0: the ground and the tallest thing standing on the tile.
function skylineOf(parts: OutlookParts, ground: Ground): Float32Array {
  const { tilesX, tilesZ } = parts;
  const skyline = new Float32Array(tilesX * tilesZ);
  for (const placement of parts.standing) {
    const top = parts.topOf(placement.id);
    for (let z = placement.tileZ; z < placement.tileZ + placement.tilesZ; z++) {
      for (let x = placement.tileX; x < placement.tileX + placement.tilesX; x++) {
        if (x < 0 || z < 0 || x >= tilesX || z >= tilesZ) continue;
        skyline[z * tilesX + x] = Math.max(skyline[z * tilesX + x]!, top);
      }
    }
  }
  for (let tile = 0; tile < skyline.length; tile++) {
    skyline[tile]! += ground.levels[tile]! * LEVEL_VOXELS;
  }
  return skyline;
}

// The sea lies towards +z on every plot (shoreline.ts), so each ray is swept from the shore
// inland: a tile's line to the sea is its neighbour's, plus that neighbour. A ray leaving the
// plot sideways sees nothing.
function rayTo(ground: Ground, skyline: Float32Array, dx: number) {
  const { tilesX, tilesZ } = ground;
  const steps = new Float32Array(tilesX * tilesZ).fill(Number.POSITIVE_INFINITY);
  const highest = new Float32Array(tilesX * tilesZ).fill(Number.NEGATIVE_INFINITY);
  for (let z = tilesZ - 1; z >= 0; z--) {
    for (let x = 0; x < tilesX; x++) {
      const nx = x + dx;
      const nz = z + 1;
      const tile = z * tilesX + x;
      if (nx < 0 || nx >= tilesX) continue;
      if (ground.sea[nz * tilesX + nx] === 1) {
        steps[tile] = 1;
      } else if (nz < tilesZ) {
        const next = nz * tilesX + nx;
        steps[tile] = steps[next]! + 1;
        highest[tile] = Math.max(highest[next]!, skyline[next]!);
      }
    }
  }
  return { steps, highest, length: Math.hypot(dx, 1) };
}

function seaAcross(ground: Ground, skyline: Float32Array) {
  const { tilesX, tilesZ } = ground;
  const horizon = new Float32Array(tilesX * tilesZ);
  const horizonHeading = new Float32Array(tilesX * tilesZ).fill(Number.NaN);
  const best = new Float32Array(tilesX * tilesZ);
  for (const dx of RAYS) {
    const ray = rayTo(ground, skyline, dx);
    for (let z = 0; z < tilesZ; z++) {
      for (let x = 0; x < tilesX; x++) {
        const tile = z * tilesX + x;
        const eye = ground.levels[tile]! * LEVEL_VOXELS + GUEST_FRAMING.eye;
        if (ray.highest[tile]! >= eye) continue;
        const seen = fadeWith(ray.steps[tile]! * ray.length);
        horizon[tile]! += seen / RAYS.length;
        if (seen <= best[tile]!) continue;
        best[tile] = seen;
        horizonHeading[tile] = Math.atan2(dx, 1);
      }
    }
  }
  return { horizon, horizonHeading };
}

// A minimum over the square, one axis at a time, so it costs twice the reach per tile.
function lowestAround(ground: Ground): Float32Array {
  const { tilesX, tilesZ } = ground;
  const across = new Float32Array(tilesX * tilesZ);
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      let low = Number.POSITIVE_INFINITY;
      for (let dx = -OVERLOOK_REACH; dx <= OVERLOOK_REACH; dx++) {
        low = Math.min(low, levelAt(ground, x + dx, z));
      }
      across[z * tilesX + x] = low;
    }
  }
  const lowest = new Float32Array(tilesX * tilesZ);
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      let low = Number.POSITIVE_INFINITY;
      const z0 = Math.max(0, z - OVERLOOK_REACH);
      const z1 = Math.min(tilesZ - 1, z + OVERLOOK_REACH);
      for (let at = z0; at <= z1; at++) low = Math.min(low, across[at * tilesX + x]!);
      lowest[z * tilesX + x] = low;
    }
  }
  return lowest;
}

function heightsOf(ground: Ground) {
  const { tilesX, tilesZ } = ground;
  const levelOf = (tileX: number, tileZ: number) => levelAt(ground, tileX, tileZ);
  const lowest = lowestAround(ground);
  const overlook = new Float32Array(tilesX * tilesZ);
  const downhill = new Float32Array(tilesX * tilesZ).fill(Number.NaN);
  for (let z = 0; z < tilesZ; z++) {
    for (let x = 0; x < tilesX; x++) {
      const tile = z * tilesX + x;
      overlook[tile] = clamp01((levelOf(x, z) - lowest[tile]!) / OVERLOOK_FULL);
      const fallX = levelOf(x - SLOPE_REACH, z) - levelOf(x + SLOPE_REACH, z);
      const fallZ = levelOf(x, z - SLOPE_REACH) - levelOf(x, z + SLOPE_REACH);
      if (fallX !== 0 || fallZ !== 0) downhill[tile] = Math.atan2(fallX, fallZ);
    }
  }
  return { overlook, downhill };
}

// Once per edit, with the scenery. Height counts twice: a guest up high sees over what stands
// below, and has the ground below them to look at.
export function outlookFor(parts: OutlookParts): Outlook {
  const ground = groundOf(parts);
  return { ...seaAcross(ground, skylineOf(parts, ground)), ...heightsOf(ground) };
}
