// Stages are computed, never authored: the catalogue is meshed once per page load with no
// re-mesh path, so a shader paints the colour in up to a line and leaves the rest grey.

import type { ModelCategory } from '../../../../voxel-gen/voxelgen.ts';
import { TICKS_PER_HOUR } from '../../resort-sim/domain/simNow';
import type { WorksPin } from '../../sim/domain/condition';

export interface BuildModel {
  readonly category: ModelCategory;
  readonly voxelCount: number;
}

// Placement key to the tick its building is finished; until then it is a site, shut to guests.
export type Sites = ReadonlyMap<string, number>;

// grounds is painted by dragging, where a timer would fight the tool; leisure is flat
// surfaces and holes rather than walls going up.
const BUILT_CATEGORIES: ReadonlySet<ModelCategory> = new Set<ModelCategory>([
  'lodging',
  'amenities',
]);

// Voxels rather than height: height alone would let a sign post through and keep a long low
// restaurant out, and a shower closed for hours would read as a bug.
const MIN_BUILD_VOXELS = 3000;

const BASE_HOURS = 1;

// Square root, because apparent size grows with the facade, not the volume: a linear rate
// would make a hotel 23 times slower than a changing block. A hotel takes most of a day, a
// cottage a working day, a changing block a morning.
const ROOT_VOXELS_PER_HOUR = 22;

const MAX_HOURS = 24;

export const GRAIN_VOXELS = 1.5;

// A share of the height: raggedness that makes a bungalow look like a site is a hairline on a hotel.
export function leadVoxels(height: number): number {
  return Math.max(6, height * 0.35);
}

// In whole hours, so the works end on the hour, as a renovation's do.
export function buildTicks(model: BuildModel): number {
  if (!BUILT_CATEGORIES.has(model.category)) return 0;
  if (model.voxelCount < MIN_BUILD_VOXELS) return 0;
  const hours = Math.min(
    BASE_HOURS + Math.sqrt(model.voxelCount) / ROOT_VOXELS_PER_HOUR,
    MAX_HOURS,
  );
  return Math.round(hours) * TICKS_PER_HOUR;
}

export const withSite = (sites: Sites, key: string, until: number): Sites =>
  new Map(sites).set(key, until);

export const withoutSite = (sites: Sites, key: string): Sites =>
  sites.has(key) ? new Map([...sites].filter(([each]) => each !== key)) : sites;

export const finishedSites = (sites: Sites, ticks: number): readonly string[] =>
  [...sites].filter(([, until]) => until <= ticks).map(([key]) => key);

export function siteProgress(until: number, duration: number, ticks: number): number {
  if (duration <= 0) return 1;
  return Math.min(Math.max(1 - (until - ticks) / duration, 0), 1);
}

// Eased so the first coat lingers and the roof settles. It runs past the top by lead plus
// grain, which the shader subtracts per column, or the paint never reaches the roof.
export function paintLineOf(progress: number, height: number): number {
  const at = Math.min(Math.max(progress, 0), 1);
  const eased = at * at * (3 - 2 * at);
  return eased * (height + leadVoxels(height) + GRAIN_VOXELS);
}

export const POP_SECONDS = 0.45;

const POP_STRETCH = 0.07;

// Up, down past rest and back, dying away: a nod the building gives on opening. 1 is at rest.
export function popStretchAt(seconds: number): number {
  const at = Math.min(Math.max(seconds / POP_SECONDS, 0), 1);
  return 1 + POP_STRETCH * Math.sin(at * 2 * Math.PI) * (1 - at);
}

interface SiteFootprint {
  readonly key: string;
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

// In the order the sites were opened, which is the order they were placed.
export function sitePins(
  sites: Sites,
  placements: readonly SiteFootprint[],
  labelOf: (placement: SiteFootprint) => string,
  durationOf: (id: string) => number,
): readonly WorksPin[] {
  const byKey = new Map(placements.map((placement) => [placement.key, placement]));
  return [...sites].flatMap(([key, until]) => {
    const placement = byKey.get(key);
    if (!placement) return [];
    const from = until - durationOf(placement.id);
    return [
      {
        key,
        label: labelOf(placement),
        at: { tileX: placement.tileX, tileZ: placement.tileZ },
        works: { kind: 'building' as const, from, until },
      },
    ];
  });
}
