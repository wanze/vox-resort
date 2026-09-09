/**
 * The baked light volume, kept up to date as lamps are put up and taken down.
 *
 * `lightGrid.ts` bakes the resort's lamps once, and that was the whole story
 * while the resort was a fixed plan. It is not one any more: the build palette
 * can stand a street lamp, a tiki torch or a swimming pool anywhere on the plot,
 * and any of those may declare lights. Re-baking the plot for each of them takes
 * 640 ms and would have to run on a click. Re-baking one lamp's block takes 2 ms.
 *
 * So an edit re-bakes a block instead of a grid. Two things already in place
 * make that sound:
 *
 * - **The scale is frozen.** Every cell's byte is a fraction of one number the
 *   first bake settled on and nothing since has moved, so a cell no new lamp
 *   reaches encodes to exactly the byte it already holds. See
 *   {@link SCALE_HEADROOM}.
 * - **A lamp's reach is a box.** Outside the box its contribution is zero by
 *   construction — the falloff is windowed to reach zero at the declared
 *   distance — so the box is the whole of what changed.
 *
 * The block is re-derived from the lamps that reach it rather than adjusted by
 * the lamp that changed, which is what makes taking a lamp away as exact as
 * putting one there and costs nothing extra: the lamps that do not reach the
 * block are skipped in six comparisons each. It also means nothing has to be
 * kept between edits — the unencoded sums a whole-grid accumulator would hold
 * come to 160 MB on this plot, against the 43.5 MB of bytes that are actually
 * needed.
 *
 * What this cannot do is grow. The grid is sized once, and a lamp that lands
 * outside it lights whatever part of it the lamp still reaches — nothing at all,
 * if it landed far enough out. {@link lampReservationFor} is what keeps that
 * from happening anywhere on the resort itself, and {@link LightGridEdit.region}
 * is how a caller learns it happened anyway.
 */

import type { LightAnchor } from './lightAnchors';
import type { BakedLightGrid, CellRange, LightGridSpec } from './lightGrid';
import { countRegion, gridInterior, rangeCells, reachOf, rebakeRegion } from './lightGrid';

export interface LightGridEdit {
  /**
   * The cells whose bytes changed, for the volume to re-upload.
   *
   * Null when none did: the lamp declares no light worth baking, or it stands
   * far enough outside the grid that none of its reach lands in it. A caller
   * counting lamps should not count that one as burning, because it is not.
   */
  readonly region: CellRange | null;
  /**
   * What a fully encoded channel now decodes to.
   *
   * The same number across every edit but one: a grid baked with no lamps at all
   * has no scale, and the first lamp added to it sets one. That is safe exactly
   * once, while every other cell is still zero — a zero cell encodes to a zero
   * byte against any scale — and the caller has to pass the new value on to the
   * shader.
   */
  readonly scale: number;
}

export interface LiveLightGrid {
  readonly spec: LightGridSpec;
  readonly irradiance: Uint8Array;
  readonly direction: Uint8Array;
  readonly scale: number;
  readonly litCells: number;
  readonly clampedCells: number;
  /** Lamps burning in the grid, which is not every lamp on the plot. */
  readonly lampCount: number;
  /** Adds one lamp. Throws if a lamp is already burning under that key. */
  add(anchor: LightAnchor): LightGridEdit;
  /** Takes one lamp away. The region is null if nothing burned under that key. */
  remove(key: string): LightGridEdit;
}

/**
 * Wraps a finished bake so lamps can be added to and removed from it.
 *
 * The anchors are the ones the bake was given; they are kept because a block
 * re-bake needs to ask every lamp whether it reaches the block, and the bytes on
 * their own cannot answer that.
 */
export function createLiveLightGrid(
  grid: BakedLightGrid,
  anchors: readonly LightAnchor[],
): LiveLightGrid {
  const { spec, irradiance, direction } = grid;
  // Only the lamps that actually burn: a declared light of no intensity is not
  // one the bake wrote anything for, and counting it would make the HUD lie.
  const burning = new Map<string, LightAnchor>();
  for (const anchor of anchors) {
    if (isBurning(anchor)) burning.set(anchor.key, anchor);
  }

  // The one block a lamp is ever allowed to write to. The outermost shell is
  // what the sampler clamps against, and light in it would smear to the horizon.
  const interior = gridInterior(spec);

  let scale = grid.scale;
  let litCells = grid.litCells;
  let clampedCells = grid.clampedCells;

  /** Re-bakes the block a lamp reaches and corrects the two totals. */
  function rebake(region: CellRange): void {
    const before = countRegion(irradiance, spec, region);
    const baked = rebakeRegion({
      anchors: [...burning.values()],
      spec,
      range: region,
      scale,
      irradiance,
      direction,
    });
    scale = baked.scale;
    const after = countRegion(irradiance, spec, region);
    litCells += after.litCells - before.litCells;
    clampedCells += after.clampedCells - before.clampedCells;
  }

  return {
    spec,
    irradiance,
    direction,
    get scale() {
      return scale;
    },
    get litCells() {
      return litCells;
    },
    get clampedCells() {
      return clampedCells;
    },
    get lampCount() {
      return burning.size;
    },
    add(anchor) {
      if (burning.has(anchor.key)) {
        throw new Error(`A lamp is already burning under "${anchor.key}"`);
      }
      const region = isBurning(anchor) ? reachOf(anchor, spec, interior) : null;
      if (!region || rangeCells(region) === 0) return { region: null, scale };
      burning.set(anchor.key, anchor);
      rebake(region);
      return { region, scale };
    },
    remove(key) {
      const anchor = burning.get(key);
      if (!anchor) return { region: null, scale };
      const region = reachOf(anchor, spec, interior);
      burning.delete(key);
      if (rangeCells(region) === 0) return { region: null, scale };
      rebake(region);
      return { region, scale };
    },
  };
}

/** Whether an anchor puts any light into the world at all. */
function isBurning(anchor: LightAnchor): boolean {
  return anchor.intensity > 0 && anchor.distance > 0;
}
