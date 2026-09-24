// Stages are computed, never authored: the catalogue is meshed once per page load with no
// re-mesh path, so a shader discards everything above the reveal height.

import type { ModelCategory } from '../../../../voxel-gen/voxelgen.ts';
import { MAX_STEP } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';

export interface BuildModel {
  readonly category: ModelCategory;
  readonly height: number;
  readonly voxelCount: number;
}

export interface ConstructionSite {
  readonly placement: Placement;
  readonly height: number;
  readonly duration: number;
  readonly elapsed: number;
}

export interface ConstructionTick {
  readonly sites: readonly ConstructionSite[];
  readonly finished: readonly ConstructionSite[];
}

// grounds is painted by dragging, where a timer would fight the tool; leisure is flat
// surfaces and holes rather than walls going up.
const BUILT_CATEGORIES: ReadonlySet<ModelCategory> = new Set<ModelCategory>([
  'lodging',
  'amenities',
]);

// Voxels rather than height: height alone would let a sign post through and keep a long low
// restaurant out, and a shower that took seconds to appear would read as a bug.
const MIN_BUILD_VOXELS = 3000;

const BASE_SECONDS = 2;

// Square root, because apparent size grows with the facade, not the volume: a linear rate
// would make a hotel 23 times slower than a changing block.
const ROOT_VOXELS_PER_SECOND = 25;

const MAX_SECONDS = 24;

// Half a voxel: faces sit on integers and the shader keeps only what is strictly below the
// line, so a whole number would lose the slab's top face.
export const FOUNDATION_VOXELS = 2.5;

export const GRAIN_VOXELS = 1.5;

// A share of the height: raggedness that makes a bungalow look like a site is a hairline on a hotel.
export function leadVoxels(height: number): number {
  return Math.max(6, height * 0.35);
}

export function buildSeconds(model: BuildModel): number {
  if (!BUILT_CATEGORIES.has(model.category)) return 0;
  if (model.voxelCount < MIN_BUILD_VOXELS) return 0;
  return Math.min(BASE_SECONDS + Math.sqrt(model.voxelCount) / ROOT_VOXELS_PER_SECOND, MAX_SECONDS);
}

export function openSite(placement: Placement, height: number, duration: number): ConstructionSite {
  return { placement, height, duration, elapsed: 0 };
}

// Clamped like the crowd's step: a backgrounded tab hands back minutes of dt and every site
// would finish unseen.
export function advanceSites(sites: readonly ConstructionSite[], dt: number): ConstructionTick {
  if (sites.length === 0) return { sites, finished: sites };
  const step = Math.min(Math.max(dt, 0), MAX_STEP);
  const going: ConstructionSite[] = [];
  const finished: ConstructionSite[] = [];
  for (const site of sites) {
    const elapsed = Math.min(site.elapsed + step, site.duration);
    const next = { ...site, elapsed };
    if (elapsed >= site.duration) finished.push(next);
    else going.push(next);
  }
  return { sites: going, finished };
}

export function progressOf(site: ConstructionSite): number {
  if (site.duration <= 0) return 1;
  return Math.min(Math.max(site.elapsed / site.duration, 0), 1);
}

// Eased so the foundation lingers and the roof settles. It runs past the top by lead plus
// grain, which the shader subtracts per column, or the building never finishes.
export function revealHeightOf(progress: number, height: number): number {
  const at = Math.min(Math.max(progress, 0), 1);
  const eased = at * at * (3 - 2 * at);
  return eased * (height + leadVoxels(height) + GRAIN_VOXELS);
}
