/**
 * Where each model is meshed.
 *
 * The scene is drawn with instancing, so a model is meshed exactly once no
 * matter how many cottages the plan puts on the plot. To get that one mesh out
 * of DVE the model is painted into its own scratch region of the voxel world:
 * regions are section-aligned and separated by a full empty section, so no
 * section ever holds two models and no model culls its neighbour's faces.
 *
 * This module is pure tile-free arithmetic — it hands back the writes to paint
 * and the region each model owns, and `regionOwning` maps a meshed section back
 * to the model it came from.
 */

import type { PaintedVoxel } from "../../../../voxel-gen/voxelgen.ts";
import type { VolumeSize } from "./sectionGrid";
import type { VoxelWrite } from "./voxelWrites";

export interface ScratchModel {
  readonly id: string;
  /** Model width in voxels; the region is sized from it. */
  readonly width: number;
  readonly voxels: readonly PaintedVoxel[];
}

export interface ScratchRegion {
  readonly id: string;
  /** First voxel x of the region; y and z always start at 0. */
  readonly x: number;
  /** One past the last voxel x the model may occupy. */
  readonly endX: number;
}

export interface ScratchLayout {
  readonly writes: readonly VoxelWrite[];
  readonly regions: readonly ScratchRegion[];
  /** Total voxel span used, so the caller can check it fits the world. */
  readonly extentX: number;
}

const alignUp = (value: number, step: number): number => Math.ceil(value / step) * step;

/** Lays every model out along x in its own section-aligned region. */
export function scratchLayoutFor(
  models: readonly ScratchModel[],
  voxelIdOf: (color: number) => string,
  sectionSize: VolumeSize,
): ScratchLayout {
  if (sectionSize.x < 1) throw new Error("Section size must be positive");

  const writes: VoxelWrite[] = [];
  const regions: ScratchRegion[] = [];
  let cursor = 0;
  for (const model of models) {
    const span = alignUp(Math.max(model.width, 1), sectionSize.x);
    regions.push({ id: model.id, x: cursor, endX: cursor + span });
    for (const voxel of model.voxels) {
      writes.push({
        x: cursor + voxel.x,
        y: voxel.y,
        z: voxel.z,
        voxelId: voxelIdOf(voxel.color),
      });
    }
    // One empty section of padding: adjacent models must not see each other.
    cursor += span + sectionSize.x;
  }
  return { writes, regions, extentX: cursor };
}

/** The region a meshed section belongs to, found by its x origin. */
export function regionOwning(
  regions: readonly ScratchRegion[],
  originX: number,
): ScratchRegion | undefined {
  return regions.find((region) => originX >= region.x && originX < region.endX);
}
