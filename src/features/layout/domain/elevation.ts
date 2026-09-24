// Functions of a tile column, not a stored field, and not bounded by the plot: the renderer
// draws the terraces out past the resort as it draws the sea.

import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { shoreFor, waterEdgeZ, waterStartZ, type Shore, type ShorePlan } from './shoreline';
import { meanderAt } from './wander';

// water keeps a step parallel to the beach; plot puts it on one row in every column, the only
// way a step can sit exactly on a street.
export type StepAnchor = 'water' | 'plot';

// Not decoration: it decides the colour, the paving and the hedges, and a dune behind a beach must stay sand.
export type TerraceSurface = 'grass' | 'sand';

export interface TerraceSpec {
  readonly level: number;
  // Checked against the rounded lines, not these numbers: two wobbles can cross even when the insets look apart.
  readonly inset: number;
  readonly anchor?: StepAnchor;
  readonly wave: number;
  readonly surface?: TerraceSurface;
}

export interface ElevationSpec {
  readonly terraces: readonly TerraceSpec[];
  readonly seed: number;
}

export interface Elevation {
  readonly spec: ElevationSpec;
  readonly shore: Shore | null;
  readonly tilesX: number;
  readonly tilesZ: number;
}

export interface ElevationPlan extends ShorePlan {
  readonly elevation?: ElevationSpec;
}

// Offset from the coast's salt so a terrace does not wander in step with the water; two per
// terrace because one meander burns two phases.
const stepSalt = (index: number): number => 3 + index * 2;

export interface LevelProvider {
  (tileX: number, tileZ: number): number;
}

export interface LevelFootprint {
  readonly tileX: number;
  readonly tileZ: number;
  readonly tilesX: number;
  readonly tilesZ: number;
}

// One level only: a flat-bottomed model across a step would half hang and half bury.
export function straddledTile(
  levelOf: LevelProvider,
  footprint: LevelFootprint,
): { readonly x: number; readonly z: number } | null {
  const level = levelOf(footprint.tileX, footprint.tileZ);
  for (let x = footprint.tileX; x < footprint.tileX + footprint.tilesX; x++) {
    for (let z = footprint.tileZ; z < footprint.tileZ + footprint.tilesZ; z++) {
      if (levelOf(x, z) !== level) return { x, z };
    }
  }
  return null;
}

export function levelHeight(level: number): number {
  return level * LEVEL_VOXELS;
}

function anchorZ(elevation: Elevation, terrace: TerraceSpec, tileX: number): number {
  const edge = elevation.tilesZ - 1;
  if ((terrace.anchor ?? 'water') === 'plot' || !elevation.shore) return edge;
  return waterEdgeZ(elevation.shore, tileX);
}

// Unrounded, so the drawn riser does not band along the column boundaries.
export function stepEdgeZ(elevation: Elevation, index: number, tileX: number): number {
  const terrace = elevation.spec.terraces[index];
  if (!terrace) throw new Error(`The plot has no terrace ${index}`);
  return (
    anchorZ(elevation, terrace, tileX) -
    terrace.inset +
    meanderAt(elevation.spec.seed, stepSalt(index), tileX, terrace.wave)
  );
}

export function stepStartZ(elevation: Elevation, index: number, tileX: number): number {
  return Math.round(stepEdgeZ(elevation, index, tileX));
}

// Steps never cross, so the walk can stop at the first step the tile is not behind.
export function terraceAt(
  elevation: Elevation | null,
  tileX: number,
  tileZ: number,
): TerraceSpec | null {
  if (!elevation) return null;
  let standing: TerraceSpec | null = null;
  for (const [index, terrace] of elevation.spec.terraces.entries()) {
    if (tileZ >= stepStartZ(elevation, index, tileX)) break;
    standing = terrace;
  }
  return standing;
}

export function levelAt(elevation: Elevation | null, tileX: number, tileZ: number): number {
  return terraceAt(elevation, tileX, tileZ)?.level ?? 0;
}

export function raisedTilesOf(elevation: Elevation | null): { x: number; z: number }[] {
  if (!elevation) return [];
  const tiles: { x: number; z: number }[] = [];
  for (let z = 0; z < elevation.tilesZ; z++) {
    for (let x = 0; x < elevation.tilesX; x++) {
      if (levelAt(elevation, x, z) > 0) tiles.push({ x, z });
    }
  }
  return tiles;
}

export function maxLevelOf(elevation: Elevation | null): number {
  if (!elevation) return 0;
  return elevation.spec.terraces.reduce((highest, terrace) => Math.max(highest, terrace.level), 0);
}

export function elevationFor(plan: ElevationPlan): Elevation | null {
  if (!plan.elevation || plan.elevation.terraces.length === 0) return null;
  const elevation: Elevation = {
    spec: plan.elevation,
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
    tilesZ: plan.tilesZ,
  };
  requireOneLevelPerStep(elevation);
  requireStepsApart(elevation);
  requireLevelBeach(elevation);
  return elevation;
}

// A stair tile climbs exactly LEVEL_VOXELS, so a two-level step is one nothing can get up.
function requireOneLevelPerStep(elevation: Elevation): void {
  let last = 0;
  for (const [index, terrace] of elevation.spec.terraces.entries()) {
    if (Math.abs(terrace.level - last) !== 1) {
      throw new Error(
        `Terrace ${index} steps from level ${last} to ${terrace.level}; a step is one level`,
      );
    }
    last = terrace.level;
  }
}

// Checked per column: wobble can cross well-spaced insets in one column, and insets on
// different anchors are not comparable at all.
function requireStepsApart(elevation: Elevation): void {
  for (let index = 1; index < elevation.spec.terraces.length; index++) {
    for (let tileX = 0; tileX < elevation.tilesX; tileX++) {
      const behind = stepStartZ(elevation, index, tileX);
      const infront = stepStartZ(elevation, index - 1, tileX);
      if (behind >= infront) {
        throw new Error(`Terraces ${index - 1} and ${index} meet at column ${tileX}`);
      }
    }
  }
}

// The beach stays level 0 so the sand is one flat sheet and a boardwalk needs no stair.
function requireLevelBeach(elevation: Elevation): void {
  const { shore } = elevation;
  if (!shore) return;
  for (let tileX = 0; tileX < elevation.tilesX; tileX++) {
    const grass = waterStartZ(shore, tileX) - shore.spec.beach;
    if (stepStartZ(elevation, 0, tileX) > grass) {
      throw new Error(`The first terrace steps onto the beach at column ${tileX}`);
    }
  }
}
