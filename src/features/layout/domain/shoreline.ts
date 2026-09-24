import { meanderAt } from './wander';

export interface ShoreSpec {
  readonly inset: number;
  readonly beach: number;
  readonly wave: number;
  readonly seed: number;
}

export interface Shore {
  readonly spec: ShoreSpec;
  readonly tilesX: number;
  readonly tilesZ: number;
}

export type Terrain = 'land' | 'beach' | 'water';

export interface ShorePlan {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly shore?: ShoreSpec;
}

export function shoreFor(plan: ShorePlan): Shore | null {
  if (!plan.shore) return null;
  if (plan.shore.inset <= 0 || plan.shore.beach <= 0) return null;
  return { spec: plan.shore, tilesX: plan.tilesX, tilesZ: plan.tilesZ };
}

// Each line across the plot has its own salt, so the terraces do not wander in step with the water.
const SHORE_SALT = 1;

function waveAt(spec: ShoreSpec, tileX: number): number {
  return meanderAt(spec.seed, SHORE_SALT, tileX, spec.wave);
}

// Unrounded, for the sea shader: a distance off the rounded edge jumps a tile per column
// and shows as diagonal bands.
export function waterEdgeZ(shore: Shore, tileX: number): number {
  return shore.tilesZ - 1 - shore.spec.inset + waveAt(shore.spec, tileX);
}

// May fall outside the plot: the renderer draws the sea out to the horizon.
export function waterStartZ(shore: Shore, tileX: number): number {
  return Math.round(waterEdgeZ(shore, tileX));
}

export function terrainAt(shore: Shore | null, tileX: number, tileZ: number): Terrain {
  if (!shore) return 'land';
  const water = waterStartZ(shore, tileX);
  if (tileZ >= water) return 'water';
  return tileZ >= water - shore.spec.beach ? 'beach' : 'land';
}

export function beachDepthAt(shore: Shore | null, tileX: number, tileZ: number): number {
  if (!shore || terrainAt(shore, tileX, tileZ) !== 'beach') return -1;
  return waterStartZ(shore, tileX) - 1 - tileZ;
}

export function isWater(shore: Shore | null, tileX: number, tileZ: number): boolean {
  return terrainAt(shore, tileX, tileZ) === 'water';
}

export function isBeach(shore: Shore | null, tileX: number, tileZ: number): boolean {
  return terrainAt(shore, tileX, tileZ) === 'beach';
}

export function waterTilesOf(shore: Shore | null): { x: number; z: number }[] {
  if (!shore) return [];
  const tiles: { x: number; z: number }[] = [];
  for (let x = 0; x < shore.tilesX; x++) {
    for (let z = Math.max(0, waterStartZ(shore, x)); z < shore.tilesZ; z++) tiles.push({ x, z });
  }
  return tiles;
}

// Landward first: the buildings get their pick of the sand before the loungers fill it.
export function beachTilesOf(shore: Shore | null): { x: number; z: number }[] {
  if (!shore) return [];
  const tiles: { x: number; z: number }[] = [];
  for (let z = 0; z < shore.tilesZ; z++) {
    for (let x = 0; x < shore.tilesX; x++) {
      if (terrainAt(shore, x, z) === 'beach') tiles.push({ x, z });
    }
  }
  return tiles;
}
