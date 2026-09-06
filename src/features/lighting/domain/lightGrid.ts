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
 * Nothing here touches Three.js: the bake is arithmetic over plain arrays, and
 * is unit-tested as such.
 */

import type { LightAnchor } from "./lightAnchors";

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
 * bakes nine times the cells: this plot is 11 MB at the finest cell size, and
 * nine of it would be 87 MB and most of a second of bake time. Rather than
 * refuse to grow, the grid coarsens — {@link lightGridSpecFor} takes the finest
 * cell size that fits this budget. Lamp light is smooth and the sampler
 * interpolates, so the coarser grid costs a little definition at the edge of a
 * pool of light and nothing else.
 */
export const DEFAULT_GRID_BUDGET_BYTES = 48 * 1024 * 1024;

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
  /** RGB per cell: the mean direction light arrives from, mapped onto 0..1. */
  readonly direction: Uint8Array;
  /** Brightest baked channel; the shader multiplies the decoded value back up. */
  readonly scale: number;
  /** Cells the bake actually wrote to, for reporting. */
  readonly litCells: number;
}

/** Square-root encodes a 0..1 value into one byte. See {@link BakedLightGrid}. */
const encodeChannel = (value: number): number =>
  Math.round(Math.sqrt(Math.max(0, Math.min(1, value))) * 255);

/** Cells needed to span `voxels`, at least one. */
const cellsFor = (voxels: number, cellSize: number): number =>
  Math.max(1, Math.ceil(voxels / cellSize));

/**
 * The smallest grid covering every lamp's reach, at a given cell size.
 *
 * Sizing to the lamps rather than to the plot means the outermost cells are
 * always dark, which is what lets the sampler clamp at the edges: ground beyond
 * the resort reads the dark edge cell and stays dark, instead of having the last
 * lit value smeared across it to the horizon.
 *
 * The floor is held just under y = 0 rather than following a lamp's reach
 * downwards; there is nothing below the ground to light.
 */
export function gridSpecAt(
  anchors: readonly LightAnchor[],
  cellSize: number,
): LightGridSpec | null {
  if (anchors.length === 0 || cellSize <= 0) return null;

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
 * The finest grid covering every lamp that still fits the memory budget.
 *
 * Coarsening is a cube root away — halving the cell size is eight times the
 * cells — so this walks up from the finest size a voxel or two at a time rather
 * than doubling, which would throw away far more definition than the budget
 * actually asks for.
 */
export function lightGridSpecFor(
  anchors: readonly LightAnchor[],
  budgetBytes: number = DEFAULT_GRID_BUDGET_BYTES,
): LightGridSpec | null {
  let cellSize = FINEST_CELL_SIZE;
  for (;;) {
    const spec = gridSpecAt(anchors, cellSize);
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
 * Splats every anchor into the grid.
 *
 * Iterating lamps and touching only the cells each one reaches — rather than
 * iterating cells and asking every lamp — is what keeps this affordable: the
 * work is set by the lamps' falloff radii, not by the size of the plot, so a
 * resort four times the area bakes in the same time per lamp.
 */
export function bakeLightGrid(
  anchors: readonly LightAnchor[],
  spec: LightGridSpec,
): BakedLightGrid {
  const { origin, cellSize, dims } = spec;
  const count = cellCount(spec);
  const sum = new Float32Array(count * 3);
  // x, y, z of the luminance-weighted direction, then the total weight.
  const flow = new Float32Array(count * 4);

  for (const anchor of anchors) {
    const cutoff = anchor.distance;
    if (cutoff <= 0 || anchor.intensity <= 0) continue;
    const [lightR, lightG, lightB] = linearRgbOf(anchor.color);

    const lowX = Math.max(0, Math.floor((anchor.x - cutoff - origin.x) / cellSize));
    const highX = Math.min(dims.x - 1, Math.ceil((anchor.x + cutoff - origin.x) / cellSize));
    const lowY = Math.max(0, Math.floor((anchor.y - cutoff - origin.y) / cellSize));
    const highY = Math.min(dims.y - 1, Math.ceil((anchor.y + cutoff - origin.y) / cellSize));
    const lowZ = Math.max(0, Math.floor((anchor.z - cutoff - origin.z) / cellSize));
    const highZ = Math.min(dims.z - 1, Math.ceil((anchor.z + cutoff - origin.z) / cellSize));

    for (let iz = lowZ; iz <= highZ; iz++) {
      const worldZ = origin.z + (iz + 0.5) * cellSize;
      const deltaZ = anchor.z - worldZ;
      for (let iy = lowY; iy <= highY; iy++) {
        const worldY = origin.y + (iy + 0.5) * cellSize;
        const deltaY = anchor.y - worldY;
        for (let ix = lowX; ix <= highX; ix++) {
          const worldX = origin.x + (ix + 0.5) * cellSize;
          const deltaX = anchor.x - worldX;

          const distance = Math.hypot(deltaX, deltaY, deltaZ);
          if (distance >= cutoff) continue;
          const strength = anchor.intensity * pointLightAttenuation(distance, cutoff);
          if (strength <= 0) continue;

          const r = lightR * strength;
          const g = lightG * strength;
          const b = lightB * strength;
          const cell = ix + dims.x * (iy + dims.y * iz);
          const rgb = cell * 3;
          sum[rgb] = sum[rgb]! + r;
          sum[rgb + 1] = sum[rgb + 1]! + g;
          sum[rgb + 2] = sum[rgb + 2]! + b;

          // A cell sitting exactly on a lamp has no direction to record; its
          // irradiance still counts, and the agreement term will read it as flat.
          const weight = luminance(r, g, b);
          const xyzw = cell * 4;
          if (distance > 1e-6) {
            const share = weight / distance;
            flow[xyzw] = flow[xyzw]! + deltaX * share;
            flow[xyzw + 1] = flow[xyzw + 1]! + deltaY * share;
            flow[xyzw + 2] = flow[xyzw + 2]! + deltaZ * share;
          }
          flow[xyzw + 3] = flow[xyzw + 3]! + weight;
        }
      }
    }
  }

  let scale = 0;
  for (const value of sum) if (value > scale) scale = value;

  const irradiance = new Uint8Array(count * 4);
  const direction = new Uint8Array(count * 4);
  let litCells = 0;

  for (let cell = 0; cell < count; cell++) {
    const r = sum[cell * 3]!;
    const g = sum[cell * 3 + 1]!;
    const b = sum[cell * 3 + 2]!;
    if (r > 0 || g > 0 || b > 0) litCells++;
    if (scale > 0) {
      irradiance[cell * 4] = encodeChannel(r / scale);
      irradiance[cell * 4 + 1] = encodeChannel(g / scale);
      irradiance[cell * 4 + 2] = encodeChannel(b / scale);
    }

    const flowX = flow[cell * 4]!;
    const flowY = flow[cell * 4 + 1]!;
    const flowZ = flow[cell * 4 + 2]!;
    const weight = flow[cell * 4 + 3]!;
    const length = Math.hypot(flowX, flowY, flowZ);
    // How much the lamps reaching this cell agree: one lamp gives 1, lamps
    // pulling in opposite directions cancel towards 0.
    const agreement = weight > 0 ? Math.min(1, length / weight) : 0;
    irradiance[cell * 4 + 3] = Math.round(agreement * 255);
    if (length > 0) {
      direction[cell * 4] = Math.round((flowX / length) * 0.5 * 255 + 127.5);
      direction[cell * 4 + 1] = Math.round((flowY / length) * 0.5 * 255 + 127.5);
      direction[cell * 4 + 2] = Math.round((flowZ / length) * 0.5 * 255 + 127.5);
    } else {
      direction[cell * 4] = 128;
      direction[cell * 4 + 1] = 128;
      direction[cell * 4 + 2] = 128;
    }
    direction[cell * 4 + 3] = 255;
  }

  return { spec, irradiance, direction, scale, litCells };
}
