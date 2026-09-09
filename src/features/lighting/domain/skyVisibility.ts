/**
 * How much of the sky each cell of the light volume can see, baked once.
 *
 * The lamps are baked because they do not move (`lightGrid.ts`); the same is
 * true of everything that blocks the sky, and for the same reason it is worth
 * paying for once. What this bakes is not a shadow: there is no sun in it, no
 * silhouette and nothing that swings as the day passes. It is the fraction of
 * the sky hemisphere a point can still see once the resort is standing around
 * it — which is what darkens a courtyard, the gap between two cottages, the
 * ground under a palm's canopy and the corner where a wall meets the ground.
 *
 * Being independent of the sun's direction is the whole point: it survives the
 * day/night cycle without a re-bake, and it costs two texture fetches that are
 * already happening. The alpha channel of the direction volume was unused, so
 * it costs no memory either — see {@link BakedLightGrid}.
 *
 * ## What it approximates
 *
 * Every object on the plot is treated as one box, and the sky it blocks from a
 * cell is that box's solid angle as seen from there. The solid angle of a box is
 * cheap and exact enough: the area a box projects along a direction is
 * `4 * (hy*hz*|ux| + hx*hz*|uy| + hx*hy*|uz|)`, and dividing that by the
 * distance squared gives the steradians it covers.
 *
 * Two corrections keep the result honest:
 *
 * - **Density.** A street lamp's bounding box is a whole tile and forty voxels
 *   tall, and the lamp is a pole. Scaling a box's contribution by the fraction
 *   of it the model's voxels actually fill is what keeps a pole from shading
 *   like a pillar. It is derived from the model, so a new object needs no rule.
 * - **Only what stands above.** Sky is up. A cell above a roof is not shaded by
 *   the building under it, so a box contributes in proportion to how far its
 *   *top* rises above the cell. Without this every rooftop on the plot bakes
 *   dark.
 *
 * What it gets wrong: two boxes shading the same patch of sky are counted
 * twice, and a box's own hollows are not seen at all. Both err towards darker in
 * exactly the places that are already dark, which is why the result is folded
 * through {@link visibilityOf} rather than subtracted.
 *
 * Nothing here touches Three.js; it is arithmetic over plain arrays, and is unit
 * tested as such.
 */

import type { CellRange, LightGridSpec } from './lightGrid';
import { forEachCell, gridInterior, rangeCells, rangeDims } from './lightGrid';

/**
 * A box on the plot, in voxels, and how solidly it is filled.
 *
 * One per placement. The box is the model's own bounding box as it stands, which
 * is what a placement already carries.
 */
export interface Occluder {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  /**
   * Fraction of the box the model's voxels fill, 0..1.
   *
   * A hedge is nearly solid, a palm is mostly air and a street lamp is almost
   * none. Derived from the model rather than declared, so the catalogue can grow
   * without anything here knowing about it.
   */
  readonly density: number;
}

/**
 * How tall a thing has to stand before it shades anything.
 *
 * A path slab is two voxels of paving lying flat on the ground: it blocks no
 * sky from anything standing on the ground beside it, and there are three and a
 * half thousand of them. Skipping them outright is most of what keeps this bake
 * affordable — see the cost note on {@link bakeSkyVisibility}.
 */
export const MIN_OCCLUDER_HEIGHT = 4;

/**
 * How dark the bake is allowed to make a fully enclosed cell.
 *
 * Sky visibility multiplies the *ambient* term and nothing else — the sun is
 * direct light and would need real shadows — so a floor here is not a fudge
 * against black, it is an admission that a courtyard still catches bounced
 * light this bake knows nothing about.
 */
export const SKY_VISIBILITY_FLOOR = 0.3;

/** How hard the accumulated obscurance bites. Tuned by eye against the plot. */
const SKY_VISIBILITY_STRENGTH = 2;

/**
 * Obscurance below which an occluder is not worth walking cells for.
 *
 * Contribution falls with the square of distance, so this converts directly into
 * the radius each box is splatted over — see {@link occluderReach}.
 */
const NEGLIGIBLE_OBSCURANCE = 0.05;

/**
 * The furthest any one box reaches, in voxels.
 *
 * Twelve metres. Past that the hotel is still contributing something, and that
 * something is a percent or two of ambient spread evenly over a district, which
 * reads as nothing and costs a great many cells.
 */
export const MAX_OCCLUDER_REACH = 48;

/** Whether a box shades anything at all. */
export function occludes(occluder: Occluder): boolean {
  return occluder.maxY - occluder.minY >= MIN_OCCLUDER_HEIGHT && occluder.density > 0;
}

/** Half-extents of a box, which is the form every formula below wants. */
function halfExtents(occluder: Occluder): { hx: number; hy: number; hz: number } {
  return {
    hx: (occluder.maxX - occluder.minX) / 2,
    hy: (occluder.maxY - occluder.minY) / 2,
    hz: (occluder.maxZ - occluder.minZ) / 2,
  };
}

/**
 * How far one box is worth splatting, in voxels.
 *
 * The largest area the box can project is bounded by its largest face, so the
 * distance at which even that falls under {@link NEGLIGIBLE_OBSCURANCE} can be
 * solved for directly rather than marched to. A pole ends up with a reach of
 * about twenty voxels and a hotel hits the cap, which is the spread that keeps
 * the bake proportional to what is actually standing.
 */
export function occluderReach(occluder: Occluder): number {
  if (!occludes(occluder)) return 0;
  const { hx, hy, hz } = halfExtents(occluder);
  const largestFace = Math.max(hy * hz, hx * hz, hx * hy);
  // The projected-area sum is largest when the direction is diagonal, which is
  // where the unit vector's components sum to sqrt(3).
  const bound = 4 * Math.sqrt(3) * largestFace * occluder.density;
  return Math.min(MAX_OCCLUDER_REACH, Math.sqrt(bound / (Math.PI * NEGLIGIBLE_OBSCURANCE)));
}

/**
 * The block of cells one box can shade, clipped to `within`.
 *
 * The same shape as a lamp's `reachOf`, and for the same two reasons: it is what
 * keeps the bake proportional to what stands on the plot rather than to the size
 * of the plot, and it is exactly the block that has to be re-baked and
 * re-uploaded when something is built.
 */
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

/**
 * The share of a point's sky one box takes, 0..1.
 *
 * Exported because it is the whole model, and a test that pins the model is
 * worth more than a test that pins the bytes it happens to encode to.
 */
export function obscuranceAt(occluder: Occluder, x: number, y: number, z: number): number {
  const { hx, hy, hz } = halfExtents(occluder);
  const dx = (occluder.minX + occluder.maxX) / 2 - x;
  const dy = (occluder.minY + occluder.maxY) / 2 - y;
  const dz = (occluder.minZ + occluder.maxZ) / 2 - z;
  const squared = dx * dx + dy * dy + dz * dz;
  // A cell sitting on the box's own centre sees nothing else at all.
  if (squared <= 0) return 1;

  const distance = Math.sqrt(squared);
  // Area of the box projected along the direction to the cell, then the solid
  // angle that covers, as a fraction of the cosine-weighted hemisphere.
  const projected =
    (4 * (hy * hz * Math.abs(dx) + hx * hz * Math.abs(dy) + hx * hy * Math.abs(dz))) / distance;
  const solidAngle = ((projected / squared) * occluder.density) / Math.PI;

  // Sky is up: a box whose top is level with the cell blocks none of it, and one
  // below blocks less than none. Measured from the top rather than the centre,
  // so a wall beside a cell still shades it and a roof beneath it does not.
  const above = (occluder.maxY - y) / distance;
  return Math.min(1, solidAngle) * Math.min(1, Math.max(0, above));
}

/**
 * Accumulated obscurance folded back into the 0..1 the shader multiplies by.
 *
 * `1 / (1 + x)` rather than `1 - x`: boxes are counted independently and the sum
 * runs past one wherever several of them crowd a cell, and a subtraction would
 * clip flat there — every enclosed cell the same black, with the shape of the
 * enclosure lost. This stays smooth however much piles up.
 */
export function visibilityOf(obscurance: number): number {
  return (
    SKY_VISIBILITY_FLOOR +
    (1 - SKY_VISIBILITY_FLOOR) / (1 + SKY_VISIBILITY_STRENGTH * Math.max(0, obscurance))
  );
}

/** Adds one box's obscurance to the cells of a block it reaches. */
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
  /** Every box on the plot; the ones outside `range` cost a comparison each. */
  readonly occluders: readonly Occluder[];
  readonly spec: LightGridSpec;
  /** The block to bake. Everything outside it is left exactly as it was. */
  readonly range: CellRange;
  /** The direction volume, whose alpha channel this owns. */
  readonly direction: Uint8Array;
}

/**
 * Bakes one block of cells from the boxes that shade it, and writes the alpha
 * bytes of the direction volume.
 *
 * Iterating boxes and touching only the cells each one reaches — rather than
 * iterating cells and asking every box — is what keeps this affordable, and it
 * is the same shape the lamp bake takes. On this plot it walks something like
 * twelve million cell-and-box pairs, most of them belonging to the hedges and
 * street lamps the layout scatters; the three and a half thousand path slabs
 * contribute none, because {@link MIN_OCCLUDER_HEIGHT} drops them before the
 * loop.
 */
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
  /** Boxes that shade something; the ones too low to matter are not counted. */
  readonly occluderCount: number;
  /**
   * Adds one box and re-bakes the block it shades.
   *
   * Null when it shades nothing: too low to count, or standing far enough
   * outside the grid that none of its reach lands in it.
   */
  add(occluder: Occluder): CellRange | null;
}

/**
 * Wraps a finished bake so objects built later shade the ground under them.
 *
 * The same bargain `liveLightGrid.ts` strikes, and it holds for the same reason:
 * a box's reach is bounded, so the block it changed is the whole of what
 * changed, and re-deriving that block from every box that reaches it is exact
 * rather than incremental. Unlike the lamps there is no scale to keep frozen —
 * visibility is already 0..1 — so nothing here can drift.
 *
 * The outermost shell of the grid is left alone, as the lamp bake leaves it
 * alone: it is what the sampler clamps against, and ground beyond the resort
 * should read as open sky rather than as whatever stood nearest the edge.
 */
export function createLiveSkyVisibility(
  spec: LightGridSpec,
  direction: Uint8Array,
  occluders: readonly Occluder[],
): LiveSkyVisibility {
  const standing = occluders.filter(occludes);
  const interior = gridInterior(spec);
  bakeSkyVisibility({ occluders: standing, spec, range: interior, direction });

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
  };
}
