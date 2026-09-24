// An edit re-bakes only the block a lamp reaches. That is exact because the scale is frozen and a lamp's
// falloff is windowed to zero at its declared distance.

import type { LightAnchor } from './lightAnchors';
import type { BakedLightGrid, CellRange, LightGridSpec } from './lightGrid';
import { countRegion, gridInterior, rangeCells, reachOf, rebakeRegion } from './lightGrid';

export interface LightGridEdit {
  // Null when no light landed in the grid; such a lamp should not be counted as burning.
  readonly region: CellRange | null;
  // Only changes when the first lamp is added to a lampless bake, which is safe while every cell is zero.
  // The caller must pass it on to the shader.
  readonly scale: number;
}

export interface LiveLightGrid {
  readonly spec: LightGridSpec;
  readonly irradiance: Uint8Array;
  readonly direction: Uint8Array;
  readonly scale: number;
  readonly litCells: number;
  readonly clampedCells: number;
  readonly lampCount: number;
  add(anchor: LightAnchor): LightGridEdit;
  remove(key: string): LightGridEdit;
}

// The anchors are kept because a block re-bake has to ask every lamp whether it reaches the block.
export function createLiveLightGrid(
  grid: BakedLightGrid,
  anchors: readonly LightAnchor[],
): LiveLightGrid {
  const { spec, irradiance, direction } = grid;
  // A declared light of no intensity was never baked, and counting it would make the HUD lie.
  const burning = new Map<string, LightAnchor>();
  for (const anchor of anchors) {
    if (isBurning(anchor)) burning.set(anchor.key, anchor);
  }

  // The outermost shell is what the sampler clamps against, and light in it would smear to the horizon.
  const interior = gridInterior(spec);

  let scale = grid.scale;
  let litCells = grid.litCells;
  let clampedCells = grid.clampedCells;

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

function isBurning(anchor: LightAnchor): boolean {
  return anchor.intensity > 0 && anchor.distance > 0;
}
