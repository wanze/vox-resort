import type { LightAnchor } from './lightAnchors';

// Lamp falloffs run 30 to 70 voxels, so this puts 8 to 18 cells across a reach: enough
// for the pool of light under a street lamp to read as round.
export const FINEST_CELL_SIZE = 4;

// Over budget the grid coarsens rather than refusing to grow: lamp light is smooth and the
// sampler interpolates.
export const DEFAULT_GRID_BUDGET_BYTES = 48 * 1024 * 1024;

export const MAX_GRID_BUDGET_BYTES = 128 * 1024 * 1024;

// A 160-tile plot plus a lamp's reach beyond each edge.
const BUDGET_BASE_SPAN = 2700;

// Grows with area up to a ceiling: a fixed budget on a plot nine times the area coarsens the
// cells until a street lamp's pool is a blotch.
export function gridBudgetFor(reserve: GridReservation | null): number {
  if (!reserve) return DEFAULT_GRID_BUDGET_BYTES;
  const area = Math.max(0, reserve.maxX - reserve.minX) * Math.max(0, reserve.maxZ - reserve.minZ);
  const scaled = (DEFAULT_GRID_BUDGET_BYTES * area) / (BUDGET_BASE_SPAN * BUDGET_BASE_SPAN);
  return Math.round(Math.min(MAX_GRID_BUDGET_BYTES, Math.max(DEFAULT_GRID_BUDGET_BYTES, scaled)));
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Matches Three.js's colour management exactly: the vertex colours the bake multiplies
// against went through the same curve.
export function srgbToLinear(channel: number): number {
  return channel < 0.04045 ? channel * 0.0773993808 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearRgbOf(color: number): [number, number, number] {
  return [
    srgbToLinear(((color >> 16) & 0xff) / 255),
    srgbToLinear(((color >> 8) & 0xff) / 255),
    srgbToLinear((color & 0xff) / 255),
  ];
}

// Copied exactly from Three.js so the bake looks as bright as the point lights it replaces.
export function pointLightAttenuation(distance: number, cutoff: number): number {
  const falloff = 1 / Math.max(distance * distance, 0.01);
  if (cutoff <= 0) return falloff;
  const windowed = Math.max(0, Math.min(1, 1 - (distance / cutoff) ** 4));
  return falloff * windowed * windowed;
}

export interface GridVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LightGridSpec {
  readonly origin: GridVector;
  readonly cellSize: number;
  readonly dims: { readonly x: number; readonly y: number; readonly z: number };
}

export interface BakedLightGrid {
  readonly spec: LightGridSpec;
  // RGB is square-root encoded against scale: most of a night scene is far below the peak
  // and a linear encoding bands there. A is how much the lamps agree on a direction.
  readonly irradiance: Uint8Array;
  // A is sky visibility, owned by skyVisibility.ts; it rides here because the shader already
  // fetches this texture.
  readonly direction: Uint8Array;
  readonly scale: number;
  readonly litCells: number;
  // Non-zero means the resort outgrew a reused scale and a full re-encode is owed.
  readonly clampedCells: number;
}

// Headroom above the peak, so a later, brighter lamp does not re-scale every cell. It costs
// a little precision at the bright end, where a night scene has least detail.
export const SCALE_HEADROOM = 1.5;

const encodeChannel = (value: number): number =>
  Math.round(Math.sqrt(Math.max(0, Math.min(1, value))) * 255);

const cellsFor = (voxels: number, cellSize: number): number =>
  Math.max(1, Math.ceil(voxels / cellSize));

// The grid is never resized, so room for lamps placed later has to be reserved before the bake.
export interface GridReservation {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

// Sized to the lamps' reach so the outer cells stay dark: the clamping sampler then keeps
// ground beyond the resort dark instead of smearing the last lit value to the horizon.
export function gridSpecAt(
  anchors: readonly LightAnchor[],
  cellSize: number,
  reserve: GridReservation | null = null,
): LightGridSpec | null {
  if ((anchors.length === 0 && !reserve) || cellSize <= 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const anchor of anchors) {
    const reach = Math.max(anchor.distance, 0);
    minX = Math.min(minX, anchor.x - reach);
    minY = Math.min(minY, anchor.y - reach);
    minZ = Math.min(minZ, anchor.z - reach);
    maxX = Math.max(maxX, anchor.x + reach);
    maxY = Math.max(maxY, anchor.y + reach);
    maxZ = Math.max(maxZ, anchor.z + reach);
  }
  if (reserve) {
    minX = Math.min(minX, reserve.minX);
    minY = Math.min(minY, reserve.minY);
    minZ = Math.min(minZ, reserve.minZ);
    maxX = Math.max(maxX, reserve.maxX);
    maxY = Math.max(maxY, reserve.maxY);
    maxZ = Math.max(maxZ, reserve.maxZ);
  }
  minY = Math.max(minY, -cellSize);

  // One cell of margin on every side guarantees a dark border to clamp against.
  const origin = {
    x: Math.floor(minX / cellSize) * cellSize - cellSize,
    y: Math.floor(minY / cellSize) * cellSize - cellSize,
    z: Math.floor(minZ / cellSize) * cellSize - cellSize,
  };
  return {
    origin,
    cellSize,
    dims: {
      x: cellsFor(maxX - origin.x, cellSize) + 1,
      y: cellsFor(maxY - origin.y, cellSize) + 1,
      z: cellsFor(maxZ - origin.z, cellSize) + 1,
    },
  };
}

// Steps a voxel or two at a time: doubling would throw away far more definition than the
// budget asks. Sized once only, since growing later means a full re-bake.
export function lightGridSpecFor(
  anchors: readonly LightAnchor[],
  budgetBytes: number = DEFAULT_GRID_BUDGET_BYTES,
  reserve: GridReservation | null = null,
): LightGridSpec | null {
  let cellSize = FINEST_CELL_SIZE;
  for (;;) {
    const spec = gridSpecAt(anchors, cellSize, reserve);
    if (!spec) return null;
    if (gridByteSize(spec) <= budgetBytes) return spec;
    cellSize += cellSize < 8 ? 1 : Math.ceil(cellSize / 4);
  }
}

export function cellCount(spec: LightGridSpec): number {
  return spec.dims.x * spec.dims.y * spec.dims.z;
}

export function gridByteSize(spec: LightGridSpec): number {
  return cellCount(spec) * 8;
}

// One shape for full and incremental bakes, so the two cannot drift apart.
export interface CellRange {
  readonly lowX: number;
  readonly highX: number;
  readonly lowY: number;
  readonly highY: number;
  readonly lowZ: number;
  readonly highZ: number;
}

export function rangeDims(range: CellRange): GridVector {
  return {
    x: range.highX - range.lowX + 1,
    y: range.highY - range.lowY + 1,
    z: range.highZ - range.lowZ + 1,
  };
}

export function rangeCells(range: CellRange): number {
  const dims = rangeDims(range);
  if (dims.x <= 0 || dims.y <= 0 || dims.z <= 0) return 0;
  return dims.x * dims.y * dims.z;
}

export function forEachCell(
  spec: LightGridSpec,
  range: CellRange,
  visit: (target: number, cell: number) => void,
): void {
  let cell = 0;
  for (let iz = range.lowZ; iz <= range.highZ; iz++) {
    for (let iy = range.lowY; iy <= range.highY; iy++) {
      for (let ix = range.lowX; ix <= range.highX; ix++, cell++) {
        visit((ix + spec.dims.x * (iy + spec.dims.y * iz)) * 4, cell);
      }
    }
  }
}

export function wholeGrid(spec: LightGridSpec): CellRange {
  return {
    lowX: 0,
    highX: spec.dims.x - 1,
    lowY: 0,
    highY: spec.dims.y - 1,
    lowZ: 0,
    highZ: spec.dims.z - 1,
  };
}

// A lamp placed later must keep the edge shell dark, since the sampler clamps against it.
export function gridInterior(spec: LightGridSpec): CellRange {
  return {
    lowX: 1,
    highX: spec.dims.x - 2,
    lowY: 0,
    highY: spec.dims.y - 2,
    lowZ: 1,
    highZ: spec.dims.z - 2,
  };
}

export function reachOf(anchor: LightAnchor, spec: LightGridSpec, within: CellRange): CellRange {
  const { origin, cellSize } = spec;
  const cutoff = Math.max(anchor.distance, 0);
  const low = (world: number, base: number, edge: number): number =>
    Math.max(edge, Math.floor((world - cutoff - base) / cellSize));
  const high = (world: number, base: number, edge: number): number =>
    Math.min(edge, Math.ceil((world + cutoff - base) / cellSize));
  return {
    lowX: low(anchor.x, origin.x, within.lowX),
    highX: high(anchor.x, origin.x, within.highX),
    lowY: low(anchor.y, origin.y, within.lowY),
    highY: high(anchor.y, origin.y, within.highY),
    lowZ: low(anchor.z, origin.z, within.lowZ),
    highZ: high(anchor.z, origin.z, within.highZ),
  };
}

// Covers only the range: a whole-grid accumulator kept alive between edits would hold ~150 MB.
interface LightAccumulator {
  readonly range: CellRange;
  readonly dims: GridVector;
  readonly sum: Float32Array;
  readonly flow: Float32Array;
}

function createAccumulator(range: CellRange): LightAccumulator {
  const dims = rangeDims(range);
  const count = rangeCells(range);
  return {
    range,
    dims,
    sum: new Float32Array(count * 3),
    flow: new Float32Array(count * 4),
  };
}

function splatCell(
  anchor: LightAnchor,
  light: readonly [number, number, number],
  delta: readonly [number, number, number],
  cell: number,
  into: LightAccumulator,
): void {
  const distance = Math.hypot(delta[0], delta[1], delta[2]);
  if (distance >= anchor.distance) return;
  const strength = anchor.intensity * pointLightAttenuation(distance, anchor.distance);
  if (strength <= 0) return;

  const { sum, flow } = into;
  const r = light[0] * strength;
  const g = light[1] * strength;
  const b = light[2] * strength;
  const rgb = cell * 3;
  sum[rgb] = sum[rgb]! + r;
  sum[rgb + 1] = sum[rgb + 1]! + g;
  sum[rgb + 2] = sum[rgb + 2]! + b;

  // A cell sitting exactly on a lamp has no direction to record; its irradiance
  // still counts, and the agreement term will read it as flat.
  const weight = luminance(r, g, b);
  const xyzw = cell * 4;
  if (distance > 1e-6) {
    const share = weight / distance;
    flow[xyzw] = flow[xyzw]! + delta[0] * share;
    flow[xyzw + 1] = flow[xyzw + 1]! + delta[1] * share;
    flow[xyzw + 2] = flow[xyzw + 2]! + delta[2] * share;
  }
  flow[xyzw + 3] = flow[xyzw + 3]! + weight;
}

// An anchor that misses costs six comparisons, so a region bake can take every anchor unindexed.
function splatAnchor(anchor: LightAnchor, spec: LightGridSpec, into: LightAccumulator): void {
  if (anchor.distance <= 0 || anchor.intensity <= 0) return;
  const { origin, cellSize } = spec;
  const light = linearRgbOf(anchor.color);
  const reach = reachOf(anchor, spec, into.range);
  const { range, dims } = into;

  for (let iz = reach.lowZ; iz <= reach.highZ; iz++) {
    const deltaZ = anchor.z - (origin.z + (iz + 0.5) * cellSize);
    for (let iy = reach.lowY; iy <= reach.highY; iy++) {
      const deltaY = anchor.y - (origin.y + (iy + 0.5) * cellSize);
      for (let ix = reach.lowX; ix <= reach.highX; ix++) {
        const deltaX = anchor.x - (origin.x + (ix + 0.5) * cellSize);
        const cell = ix - range.lowX + dims.x * (iy - range.lowY + dims.y * (iz - range.lowZ));
        splatCell(anchor, light, [deltaX, deltaY, deltaZ], cell, into);
      }
    }
  }
}

function measureScale(sum: Float32Array): number {
  let peak = 0;
  for (const value of sum) if (value > peak) peak = value;
  return peak * SCALE_HEADROOM;
}

function encodeDirection(
  flow: Float32Array,
  at: number,
  target: number,
  irradiance: Uint8Array,
  direction: Uint8Array,
): void {
  const flowX = flow[at]!;
  const flowY = flow[at + 1]!;
  const flowZ = flow[at + 2]!;
  const weight = flow[at + 3]!;
  const length = Math.hypot(flowX, flowY, flowZ);

  const agreement = weight > 0 ? Math.min(1, length / weight) : 0;
  irradiance[target + 3] = Math.round(agreement * 255);

  const axis = (value: number): number => Math.round((value / length) * 0.5 * 255 + 127.5);
  direction[target] = length > 0 ? axis(flowX) : 128;
  direction[target + 1] = length > 0 ? axis(flowY) : 128;
  direction[target + 2] = length > 0 ? axis(flowZ) : 128;
  // Alpha carries sky visibility, which no lamp changes; writing it would wipe that bake.
}

function encodeCell(
  field: LightAccumulator,
  cell: number,
  scale: number,
  target: number,
  irradiance: Uint8Array,
  direction: Uint8Array,
): void {
  const at = cell * 3;
  const factor = scale > 0 ? 1 / scale : 0;
  irradiance[target] = encodeChannel(field.sum[at]! * factor);
  irradiance[target + 1] = encodeChannel(field.sum[at + 1]! * factor);
  irradiance[target + 2] = encodeChannel(field.sum[at + 2]! * factor);
  encodeDirection(field.flow, cell * 4, target, irradiance, direction);
}

export interface RegionBake {
  readonly scale: number;
}

export interface RebakeRegionOptions {
  readonly anchors: readonly LightAnchor[];
  readonly spec: LightGridSpec;
  readonly range: CellRange;
  // Non-positive means measure from this region, which is only sound while the rest of the
  // grid is dark.
  readonly scale: number;
  readonly irradiance: Uint8Array;
  readonly direction: Uint8Array;
}

// Re-derived from scratch rather than adjusted, so removing a lamp is exact instead of a
// float subtraction in a different order.
export function rebakeRegion(options: RebakeRegionOptions): RegionBake {
  const { anchors, spec, range, irradiance, direction } = options;
  if (rangeCells(range) === 0) return { scale: options.scale };

  const field = createAccumulator(range);
  for (const anchor of anchors) splatAnchor(anchor, spec, field);
  const scale = options.scale > 0 ? options.scale : measureScale(field.sum);

  forEachCell(spec, range, (target, cell) => {
    encodeCell(field, cell, scale, target, irradiance, direction);
  });
  return { scale };
}

export interface RegionCounts {
  readonly litCells: number;
  readonly clampedCells: number;
}

export function countRegion(
  irradiance: Uint8Array,
  spec: LightGridSpec,
  range: CellRange,
): RegionCounts {
  let litCells = 0;
  let clampedCells = 0;
  for (let iz = range.lowZ; iz <= range.highZ; iz++) {
    for (let iy = range.lowY; iy <= range.highY; iy++) {
      for (let ix = range.lowX; ix <= range.highX; ix++) {
        const at = (ix + spec.dims.x * (iy + spec.dims.y * iz)) * 4;
        const brightest = Math.max(irradiance[at]!, irradiance[at + 1]!, irradiance[at + 2]!);
        if (brightest > 0) litCells++;
        if (brightest === 255) clampedCells++;
      }
    }
  }
  return { litCells, clampedCells };
}

export interface BakeOptions {
  readonly scale?: number;
}

export function bakeLightGrid(
  anchors: readonly LightAnchor[],
  spec: LightGridSpec,
  options: BakeOptions = {},
): BakedLightGrid {
  const count = cellCount(spec);
  const irradiance = new Uint8Array(count * 4);
  const direction = new Uint8Array(count * 4);
  // Sky starts fully open: a zeroed alpha would read as no sky and shade the plot flat.
  direction.fill(255);
  const range = wholeGrid(spec);
  const { scale } = rebakeRegion({
    anchors,
    spec,
    range,
    scale: options.scale ?? 0,
    irradiance,
    direction,
  });
  return { spec, irradiance, direction, scale, ...countRegion(irradiance, spec, range) };
}
