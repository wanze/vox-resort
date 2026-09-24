import type { CellRange, LightGridSpec } from './lightGrid';
import { forEachCell, gridInterior, rangeCells, rangeDims } from './lightGrid';

export interface Occluder {
  readonly key: string;
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  // Scaled by fill, so a street lamp's tall bounding box does not shade like a pillar.
  readonly density: number;
}

// Path slabs block no sky and number in the thousands; skipping them keeps the bake affordable.
export const MIN_OCCLUDER_HEIGHT = 4;

// Multiplies ambient only, and enclosed cells still catch bounced light this bake
// knows nothing about, so it never goes to black.
export const SKY_VISIBILITY_FLOOR = 0.3;

// Tuned by eye against the plot.
const SKY_VISIBILITY_STRENGTH = 2;

const NEGLIGIBLE_OBSCURANCE = 0.05;

// Past 12 m a box adds a percent or two of ambient over a whole district: invisible and costly.
export const MAX_OCCLUDER_REACH = 48;

export function occludes(occluder: Occluder): boolean {
  return occluder.maxY - occluder.minY >= MIN_OCCLUDER_HEIGHT && occluder.density > 0;
}

function halfExtents(occluder: Occluder): { hx: number; hy: number; hz: number } {
  return {
    hx: (occluder.maxX - occluder.minX) / 2,
    hy: (occluder.maxY - occluder.minY) / 2,
    hz: (occluder.maxZ - occluder.minZ) / 2,
  };
}

export function occluderReach(occluder: Occluder): number {
  if (!occludes(occluder)) return 0;
  const { hx, hy, hz } = halfExtents(occluder);
  const largestFace = Math.max(hy * hz, hx * hz, hx * hy);
  // The projected-area sum peaks on the diagonal, where the unit components sum to sqrt(3).
  const bound = 4 * Math.sqrt(3) * largestFace * occluder.density;
  return Math.min(MAX_OCCLUDER_REACH, Math.sqrt(bound / (Math.PI * NEGLIGIBLE_OBSCURANCE)));
}

export function occluderRange(
  occluder: Occluder,
  spec: LightGridSpec,
  within: CellRange,
): CellRange {
  const { origin, cellSize } = spec;
  const reach = occluderReach(occluder);
  const low = (world: number, base: number, edge: number): number =>
    Math.max(edge, Math.floor((world - reach - base) / cellSize));
  const high = (world: number, base: number, edge: number): number =>
    Math.min(edge, Math.ceil((world + reach - base) / cellSize));
  return {
    lowX: low(occluder.minX, origin.x, within.lowX),
    highX: high(occluder.maxX, origin.x, within.highX),
    lowY: low(occluder.minY, origin.y, within.lowY),
    highY: high(occluder.maxY, origin.y, within.highY),
    lowZ: low(occluder.minZ, origin.z, within.lowZ),
    highZ: high(occluder.maxZ, origin.z, within.highZ),
  };
}

export function obscuranceAt(occluder: Occluder, x: number, y: number, z: number): number {
  const { hx, hy, hz } = halfExtents(occluder);
  const dx = (occluder.minX + occluder.maxX) / 2 - x;
  const dy = (occluder.minY + occluder.maxY) / 2 - y;
  const dz = (occluder.minZ + occluder.maxZ) / 2 - z;
  const squared = dx * dx + dy * dy + dz * dz;
  if (squared <= 0) return 1;

  const distance = Math.sqrt(squared);
  // Projected area along the direction, then its solid angle over the cosine-weighted hemisphere.
  const projected =
    (4 * (hy * hz * Math.abs(dx) + hx * hz * Math.abs(dy) + hx * hy * Math.abs(dz))) / distance;
  const solidAngle = ((projected / squared) * occluder.density) / Math.PI;

  // Measured from the box's top, since sky is up: a wall beside a cell shades it,
  // a roof beneath it does not.
  const above = (occluder.maxY - y) / distance;
  return Math.min(1, solidAngle) * Math.min(1, Math.max(0, above));
}

// 1 / (1 + x) rather than 1 - x: boxes are summed independently and overshoot one where
// they crowd, and a subtraction would clip every enclosed cell to the same black.
export function visibilityOf(obscurance: number): number {
  return (
    SKY_VISIBILITY_FLOOR +
    (1 - SKY_VISIBILITY_FLOOR) / (1 + SKY_VISIBILITY_STRENGTH * Math.max(0, obscurance))
  );
}

function splatOccluder(
  occluder: Occluder,
  spec: LightGridSpec,
  range: CellRange,
  into: Float32Array,
): void {
  if (!occludes(occluder)) return;
  const { origin, cellSize } = spec;
  const reach = occluderRange(occluder, spec, range);
  const dims = rangeDims(range);

  for (let iz = reach.lowZ; iz <= reach.highZ; iz++) {
    const z = origin.z + (iz + 0.5) * cellSize;
    for (let iy = reach.lowY; iy <= reach.highY; iy++) {
      const y = origin.y + (iy + 0.5) * cellSize;
      for (let ix = reach.lowX; ix <= reach.highX; ix++) {
        const x = origin.x + (ix + 0.5) * cellSize;
        const cell = ix - range.lowX + dims.x * (iy - range.lowY + dims.y * (iz - range.lowZ));
        into[cell] = into[cell]! + obscuranceAt(occluder, x, y, z);
      }
    }
  }
}

export interface SkyVisibilityBake {
  readonly occluders: readonly Occluder[];
  readonly spec: LightGridSpec;
  readonly range: CellRange;
  readonly direction: Uint8Array;
}

// Iterates boxes, touching only the cells each reaches, rather than asking every box per cell.
export function bakeSkyVisibility(options: SkyVisibilityBake): void {
  const { occluders, spec, range, direction } = options;
  const cells = rangeCells(range);
  if (cells === 0) return;

  const obscurance = new Float32Array(cells);
  for (const occluder of occluders) splatOccluder(occluder, spec, range, obscurance);

  forEachCell(spec, range, (target, cell) => {
    direction[target + 3] = Math.round(visibilityOf(obscurance[cell]!) * 255);
  });
}

export interface LiveSkyVisibility {
  readonly occluderCount: number;
  add(occluder: Occluder): CellRange | null;
  // Re-derives the block from the remaining boxes rather than subtracting, so removal is exact.
  remove(key: string): CellRange | null;
}

// The grid's outer shell is left alone: the sampler clamps against it, so ground beyond
// the resort reads as open sky.
export function createLiveSkyVisibility(
  spec: LightGridSpec,
  direction: Uint8Array,
  occluders: readonly Occluder[],
  alreadyBaked = false,
): LiveSkyVisibility {
  const standing = occluders.filter(occludes);
  const interior = gridInterior(spec);
  if (!alreadyBaked) bakeSkyVisibility({ occluders: standing, spec, range: interior, direction });

  return {
    get occluderCount() {
      return standing.length;
    },
    add(occluder) {
      if (!occludes(occluder)) return null;
      const range = occluderRange(occluder, spec, interior);
      if (rangeCells(range) === 0) return null;
      standing.push(occluder);
      bakeSkyVisibility({ occluders: standing, spec, range, direction });
      return range;
    },
    remove(key) {
      const at = standing.findIndex((occluder) => occluder.key === key);
      if (at === -1) return null;
      // Spliced, not swapped with the last: the block sums in list order, and keeping
      // the order keeps the bytes identical to a bake that never had the box.
      const [gone] = standing.splice(at, 1);
      const range = occluderRange(gone!, spec, interior);
      bakeSkyVisibility({ occluders: standing, spec, range, direction });
      return range;
    },
  };
}
