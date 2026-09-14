/**
 * Bakes the resort's lamps into a volume, once, so the shader stops evaluating
 * them per fragment.
 *
 * The resort does not move and neither do its lights, yet the renderer was
 * re-deriving the same answer for all 85 of them sixty times a second — and
 * because point-light cost is paid per lit fragment, that answer cost more the
 * more of the screen was lit. Measured on this plot at 2880x1626: the scene
 * renders in 8.3 ms with the pool switched off and 33 ms with sixteen lights on,
 * and the whole difference is fragment work.
 *
 * So the lamps are baked into an irradiance volume covering the plot. Every
 * anchor is splatted into it once at load, and the shader then answers "how much
 * lamp light reaches this point" with two texture fetches, whatever the resort's
 * size and however many lamps it has. Sixteen-of-85 becomes all 85, the pool
 * stops popping as the camera moves, and night costs what day costs.
 *
 * Two values are baked per cell:
 *
 * - **Irradiance** — the light arriving at the cell, summed over every lamp that
 *   reaches it, as it would fall on a surface facing each lamp squarely.
 * - **Direction** — the luminance-weighted mean direction that light came from,
 *   plus how much the lamps agree on it. One lamp overhead gives a direction and
 *   full agreement; a cell between four lamps gives near-zero agreement and is
 *   shaded flatly, which is what being between four lamps looks like.
 *
 * The shader reconstructs `irradiance * mix(isotropic, N·L, agreement)`, so a
 * wall facing a lamp is bright and the wall behind it is not. That is an
 * approximation of the sixteen point lights it replaces, and a
 * better-behaved one: it accounts for all of them rather than the nearest few.
 *
 * The resort is no longer fixed, either: objects are placed at runtime and any
 * of them may declare lights. Nothing here re-bakes a plot for that — a bake is
 * expressed over a {@link CellRange}, so {@link rebakeRegion} can be handed the
 * block one lamp reaches instead of the whole grid. `liveLightGrid.ts` is what
 * uses that.
 *
 * Nothing here touches Three.js: the bake is arithmetic over plain arrays, and
 * is unit-tested as such.
 */

import type { LightAnchor } from './lightAnchors';

/**
 * Voxels per cell edge, at the finest the grid is ever baked.
 *
 * The falloff distances the models declare run from 30 to 70 voxels, so four
 * voxels puts 8 to 18 cells across a lamp's reach — enough that the pool of
 * light under a street lamp reads as round once the sampler interpolates.
 */
export const FINEST_CELL_SIZE = 4;

/**
 * How much GPU memory the two volumes may take between them.
 *
 * Cell count goes with the plot's *volume*, so a resort three times as wide
 * bakes nine times the cells: this plot is 43 MB at the finest cell size, and
 * nine of it would be 390 MB and several seconds of bake time. Rather than
 * refuse to grow, the grid coarsens — {@link lightGridSpecFor} takes the finest
 * cell size that fits this budget. Lamp light is smooth and the sampler
 * interpolates, so the coarser grid costs a little definition at the edge of a
 * pool of light and nothing else.
 */
export const DEFAULT_GRID_BUDGET_BYTES = 48 * 1024 * 1024;

/** The most the budget grows to, however large the resort: see {@link gridBudgetFor}. */
export const MAX_GRID_BUDGET_BYTES = 128 * 1024 * 1024;

/**
 * The span, in voxels a side, the default budget was sized for: a 160-tile plot
 * and a lamp's reach beyond each edge.
 */
const BUDGET_BASE_SPAN = 2700;

/**
 * The budget for a grid that has to cover this reservation.
 *
 * The default up to the plot it was sized for, then growing with the area to a
 * ceiling. A fixed budget over a plot nine times the area coarsens the cells
 * from five voxels to eleven — a pool of light under a street lamp is then three
 * or four cells across and reads as a blotch — while the ceiling keeps both
 * volumes well inside what a GPU hands out without complaint.
 */
export function gridBudgetFor(reserve: GridReservation | null): number {
  if (!reserve) return DEFAULT_GRID_BUDGET_BYTES;
  const area = Math.max(0, reserve.maxX - reserve.minX) * Math.max(0, reserve.maxZ - reserve.minZ);
  const scaled = (DEFAULT_GRID_BUDGET_BYTES * area) / (BUDGET_BASE_SPAN * BUDGET_BASE_SPAN);
  return Math.round(Math.min(MAX_GRID_BUDGET_BYTES, Math.max(DEFAULT_GRID_BUDGET_BYTES, scaled)));
}

/** Rec. 709 luminance, used to weight which direction light came from. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * sRGB to linear, matching Three.js's own colour management exactly — the
 * vertex colours the bake multiplies against went through the same curve.
 */
export function srgbToLinear(channel: number): number {
  return channel < 0.04045 ? channel * 0.0773993808 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Splits a packed `0xRRGGBB` into linear RGB, the space the shader works in. */
export function linearRgbOf(color: number): [number, number, number] {
  return [
    srgbToLinear(((color >> 16) & 0xff) / 255),
    srgbToLinear(((color >> 8) & 0xff) / 255),
    srgbToLinear((color & 0xff) / 255),
  ];
}

/**
 * Three.js's point-light falloff, reproduced: inverse-square with a windowed
 * cutoff so the light reaches exactly zero at its declared distance. Copied
 * rather than approximated, so switching the pool off for the bake does not
 * change how bright the resort looks.
 */
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
  /** World-space corner of cell (0,0,0), in voxels. */
  readonly origin: GridVector;
  readonly cellSize: number;
  /** Cell counts along each axis. */
  readonly dims: { readonly x: number; readonly y: number; readonly z: number };
}

export interface BakedLightGrid {
  readonly spec: LightGridSpec;
  /**
   * RGBA per cell. RGB is irradiance, square-root encoded against `scale` to
   * spend the eight bits where the eye is: most of a night scene sits far below
   * the brightest cell, and a linear encoding bands visibly there.
   * A is how strongly the lamps reaching this cell agree on a direction.
   */
  readonly irradiance: Uint8Array;
  /**
   * RGB per cell: the mean direction light arrives from, mapped onto 0..1.
   *
   * A is how much of the sky the cell can still see, which has nothing to do
   * with the lamps and is not written here: `skyVisibility.ts` owns that channel
   * and bakes it from what stands on the plot. It rides in this texture because
   * the shader already fetches it and the channel was otherwise spare. Every
   * cell starts fully open, so a grid nothing ever bakes visibility into shades
   * exactly as it did before there was any.
   */
  readonly direction: Uint8Array;
  /**
   * What a fully encoded channel decodes back to; the shader multiplies by this.
   *
   * Carried between bakes rather than measured afresh by each one, so that
   * adding a lamp re-encodes only the cells it reaches. See
   * {@link SCALE_HEADROOM}.
   */
  readonly scale: number;
  /** Cells that encoded to a colour, for reporting. */
  readonly litCells: number;
  /**
   * Cells too bright for `scale` to hold, which encoded as clamped.
   *
   * Always zero on a bake that measured its own scale. A caller reusing an
   * earlier one watches this to learn that the resort has outgrown it and a full
   * re-encode is owed.
   */
  readonly clampedCells: number;
}

/**
 * How far above the brightest cell it finds a measuring bake sets its scale.
 *
 * The bake used to normalise against that brightest cell exactly, which made
 * every cell's byte depend on every lamp on the plot: one lamp brighter than
 * anything already standing re-scaled all 5.4 M of them. Leaving room above the
 * peak decouples the two, so a lamp placed later can be splatted into the cells
 * it reaches and no others.
 *
 * The cost is a little precision: at 1.5x, the brightest cell encodes to 208
 * rather than 255. Because the encoding is square-root, that loss lands at the
 * bright end, where a night scene has least of its detail. What it buys is a
 * number that stays put.
 */
export const SCALE_HEADROOM = 1.5;

/** Square-root encodes a 0..1 value into one byte. See {@link BakedLightGrid}. */
const encodeChannel = (value: number): number =>
  Math.round(Math.sqrt(Math.max(0, Math.min(1, value))) * 255);

/** Cells needed to span `voxels`, at least one. */
const cellsFor = (voxels: number, cellSize: number): number =>
  Math.max(1, Math.ceil(voxels / cellSize));

/**
 * A box the grid must cover whether or not a lamp lights it today.
 *
 * The grid is baked once and never resized — see {@link lightGridSpecFor} — so
 * the room a lamp placed later will need has to be asked for before the bake.
 * {@link lampReservationFor} works out what to ask for.
 */
export interface GridReservation {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/**
 * The smallest grid covering every lamp's reach and the reserved box, at a given
 * cell size.
 *
 * Sizing to the lamps rather than to the plot means the outermost cells are
 * always dark, which is what lets the sampler clamp at the edges: ground beyond
 * the resort reads the dark edge cell and stays dark, instead of having the last
 * lit value smeared across it to the horizon. A reservation is measured the same
 * way and gets the same dark border, so ground inside it that nothing lights
 * yet behaves exactly like ground outside the grid altogether.
 *
 * The floor is held just under y = 0 rather than following a lamp's reach
 * downwards; there is nothing below the ground to light.
 */
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

/**
 * The finest grid covering every lamp and every reservation that still fits the
 * memory budget.
 *
 * Coarsening is a cube root away — halving the cell size is eight times the
 * cells — so this walks up from the finest size a voxel or two at a time rather
 * than doubling, which would throw away far more definition than the budget
 * actually asks for.
 *
 * This is the one and only time the grid is sized. Growing it later would mean
 * re-baking every cell — half a second on this plot — reallocating both volumes
 * and, since the budget is already most spent, coarsening the cells under a
 * scene that is being looked at. Reserving the room up front costs a fraction of
 * a megabyte and no bake at all; see {@link lampReservationFor}.
 */
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
    // Each step is a linear increase in cell size and a cubic drop in cells, so
    // this converges in a handful of iterations however large the plot is.
    cellSize += cellSize < 8 ? 1 : Math.ceil(cellSize / 4);
  }
}

/** Cells the grid holds. */
export function cellCount(spec: LightGridSpec): number {
  return spec.dims.x * spec.dims.y * spec.dims.z;
}

/** Bytes the two textures will occupy on the GPU. */
export function gridByteSize(spec: LightGridSpec): number {
  return cellCount(spec) * 8;
}

/**
 * A block of cells, inclusive at both ends.
 *
 * Everything the bake does is done over one of these: the initial bake takes the
 * whole grid, and adding or removing a lamp takes the block that lamp reaches.
 * Having one shape for both is what lets the two share their arithmetic, so an
 * incremental bake cannot drift away from what a full one would have written.
 */
export interface CellRange {
  readonly lowX: number;
  readonly highX: number;
  readonly lowY: number;
  readonly highY: number;
  readonly lowZ: number;
  readonly highZ: number;
}

/** Cells the range spans along each axis. */
export function rangeDims(range: CellRange): GridVector {
  return {
    x: range.highX - range.lowX + 1,
    y: range.highY - range.lowY + 1,
    z: range.highZ - range.lowZ + 1,
  };
}

/** Cells the range holds; zero when it holds none. */
export function rangeCells(range: CellRange): number {
  const dims = rangeDims(range);
  if (dims.x <= 0 || dims.y <= 0 || dims.z <= 0) return 0;
  return dims.x * dims.y * dims.z;
}

/**
 * Walks a block of cells, handing each one its offset in the volume's bytes and
 * its index within an accumulator sized to the block.
 *
 * Both bakes over this volume need exactly this walk and need the two numbers to
 * stay in step — the lamps encode from an accumulator filled in this order, and
 * so does the sky visibility in `skyVisibility.ts`. Deriving either index from
 * the other per cell is arithmetic neither of them has to do.
 */
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

/** Every cell of the grid. */
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

/**
 * Every cell a lamp placed later is allowed to write to.
 *
 * The shell is what the sampler clamps against: ground beyond the resort reads
 * the nearest edge cell, so an edge cell that is lit smears its light across
 * every metre out to the horizon. {@link gridSpecAt} keeps that shell dark by
 * construction — it sizes the grid to the lamps' full reach and then adds a cell
 * of margin — and a lamp placed later has to be held to the same rule.
 *
 * The floor is the exception, and it is the same exception {@link gridSpecAt}
 * makes: the bottom layer sits just under y = 0, the lamps standing at load
 * light it, and nothing samples below it, because below it is ground.
 */
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

/**
 * The block of cells an anchor can reach, clipped to `within`.
 *
 * This is what keeps a bake proportional to the lamps rather than to the plot,
 * and it is also exactly the region that has to be re-encoded and re-uploaded
 * when that lamp is added or taken away. Empty — {@link rangeCells} of zero —
 * when the anchor reaches nothing inside `within`.
 */
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

/**
 * The light arriving at every cell of one range, and the direction it came from,
 * unencoded.
 *
 * Kept apart from the encoding below because the two phases have different
 * reasons to run: splatting is per lamp and touches only the cells that lamp
 * reaches, while encoding is per cell and depends on the scale.
 *
 * The arrays cover `range` and nothing else, which is what makes an incremental
 * bake affordable in memory as well as in time: re-baking the block one street
 * lamp reaches allocates about 400 kB, where keeping a whole-grid accumulator
 * alive between edits would hold on to 150 MB of this plot for good.
 */
interface LightAccumulator {
  readonly range: CellRange;
  readonly dims: GridVector;
  /** Linear RGB per cell, summed over every lamp reaching it. */
  readonly sum: Float32Array;
  /** Luminance-weighted direction per cell: x, y, z, then the total weight. */
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

/** Adds one lamp's light to a single cell, if it reaches that far. */
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

/**
 * Adds one anchor's contribution to the cells of the accumulator it reaches.
 *
 * An anchor that reaches none of them — most of them, on a plot of 425 lamps
 * being re-baked one street lamp at a time — costs six comparisons and no loop
 * iterations at all, which is why a region bake can be handed every anchor on
 * the plot rather than having to index them first.
 */
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

/** The scale a measuring bake settles on: the brightest cell, plus headroom. */
function measureScale(sum: Float32Array): number {
  let peak = 0;
  for (const value of sum) if (value > peak) peak = value;
  return peak * SCALE_HEADROOM;
}

/** Writes one cell's direction and agreement into the two byte arrays. */
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

  // How much the lamps reaching this cell agree: one lamp gives 1, lamps
  // pulling in opposite directions cancel towards 0.
  const agreement = weight > 0 ? Math.min(1, length / weight) : 0;
  irradiance[target + 3] = Math.round(agreement * 255);

  const axis = (value: number): number => Math.round((value / length) * 0.5 * 255 + 127.5);
  direction[target] = length > 0 ? axis(flowX) : 128;
  direction[target + 1] = length > 0 ? axis(flowY) : 128;
  direction[target + 2] = length > 0 ? axis(flowZ) : 128;
  // Alpha is left exactly as it was: it carries sky visibility, which no lamp
  // changes. Writing it here would wipe that bake every time a lamp went up.
}

/** Writes one cell's colour, direction and agreement into the two byte arrays. */
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
  /**
   * The scale the region was encoded against: the one asked for, or the one
   * measured here when none was.
   */
  readonly scale: number;
}

export interface RebakeRegionOptions {
  /** Every lamp that burns; the ones outside `range` cost a comparison each. */
  readonly anchors: readonly LightAnchor[];
  readonly spec: LightGridSpec;
  /** The block to re-bake. Everything outside it is left exactly as it was. */
  readonly range: CellRange;
  /**
   * What a fully encoded channel should decode back to. Non-positive means
   * "measure one from this region", which is only sound while the rest of the
   * grid is dark — a zero cell encodes to a zero byte against any scale.
   */
  readonly scale: number;
  readonly irradiance: Uint8Array;
  readonly direction: Uint8Array;
}

/**
 * Bakes one block of cells from the lamps that reach it, and writes the bytes.
 *
 * The block is re-derived from scratch rather than adjusted, which is what makes
 * taking a lamp away as exact as putting one there: removal is not a subtraction
 * that has to undo a float sum in a different order from the one that built it,
 * it is the same bake over the same block with one fewer lamp in the list.
 */
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
  /** Cells the bake wrote a colour to. */
  readonly litCells: number;
  /** Cells too bright for the scale to hold, which encoded as clamped. */
  readonly clampedCells: number;
}

/**
 * Reads the two counts back out of the encoded bytes.
 *
 * Counted from the output rather than from the light that produced it, so the
 * same reckoning works over a block that was baked long ago as over one baked a
 * moment ago: adding a lamp can correct the totals by counting its block before
 * and after, without keeping anything else around.
 */
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
  /**
   * The scale to encode against, instead of measuring one from these anchors.
   *
   * Pass an earlier bake's `scale` and the bytes this one writes are directly
   * comparable with that one's, which is the whole point: a cell no new lamp
   * reaches encodes to exactly the byte it held before. A non-positive value is
   * ignored and the scale measured as usual.
   */
  readonly scale?: number;
}

/**
 * Bakes every lamp on the plot into a fresh grid.
 *
 * Iterating lamps and touching only the cells each one reaches — rather than
 * iterating cells and asking every lamp — is what keeps this affordable: the
 * work is set by the lamps' falloff radii, not by the size of the plot, so a
 * resort four times the area bakes in the same time per lamp.
 */
export function bakeLightGrid(
  anchors: readonly LightAnchor[],
  spec: LightGridSpec,
  options: BakeOptions = {},
): BakedLightGrid {
  const count = cellCount(spec);
  const irradiance = new Uint8Array(count * 4);
  const direction = new Uint8Array(count * 4);
  // Sky fully open everywhere, before anything bakes an opinion into the alpha
  // channel: a zeroed byte there would read as a cell that can see no sky at
  // all, and the whole plot would come out shaded flat. The bake below
  // overwrites the other three channels of every cell, so filling all four is
  // one pass rather than a strided one.
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
