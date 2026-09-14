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

import type { PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
import type { VolumeSize } from './sectionGrid';

export interface ScratchModel {
  readonly id: string;
  /** Model width in voxels; the region is sized from it. */
  readonly width: number;
  readonly voxels: readonly PaintedVoxel[];
  /**
   * How many voxels of the model one painted voxel stands for; 1 when absent.
   * A coarse copy is painted small and scaled back up — see `coarseVoxels.ts`.
   */
  readonly scale?: number;
  /** The model whose declared colours decide this one's surfaces; itself when absent. */
  readonly source?: string;
}

export interface ScratchRegion {
  readonly id: string;
  /** First voxel x of the region; y and z always start at 0. */
  readonly x: number;
  /** One past the last voxel x the model may occupy. */
  readonly endX: number;
  /** See {@link ScratchModel.scale}. */
  readonly scale?: number;
  /** See {@link ScratchModel.source}. */
  readonly source?: string;
}

/**
 * The painted voxels, packed from the moment they are laid out to the moment DVE
 * reads them.
 *
 * The catalogue is three quarters of a million voxels, and structured-cloning
 * that many small objects across a worker boundary costs more than the meshing
 * the worker was meant to take off the main thread. Packed into typed arrays the
 * same data transfers rather than copies, and the ids — of which there are a
 * couple of hundred distinct values, one per colour — become indices into a
 * palette sent alongside. Anything a voxel ever needs to carry beyond this
 * belongs in a parallel typed array, not in an object per voxel.
 */
export interface PackedVoxelWrites {
  /** x, y, z per write, interleaved. */
  readonly positions: Int32Array;
  /** Index into `palette` per write. */
  readonly voxelIds: Uint16Array;
  /** DVE voxel ids, one per distinct id painted. */
  readonly palette: readonly string[];
}

export interface ScratchLayout {
  readonly writes: PackedVoxelWrites;
  readonly regions: readonly ScratchRegion[];
  /** Total voxel span used, so the caller can check it fits the world. */
  readonly extentX: number;
}

const alignUp = (value: number, step: number): number => Math.ceil(value / step) * step;

/**
 * Lays every model out along x in its own section-aligned region.
 *
 * The writes come out packed, because packed is what they are: a position and
 * one of a couple of hundred colours, three quarters of a million times. Building
 * an object and an id string per voxel only for the worker boundary to take them
 * apart again was most of a startup cost paid before first paint. `voxelIdOf` is
 * asked once per distinct colour, and the palette keeps one entry per distinct
 * id, in the order they were first seen.
 */
export function scratchLayoutFor(
  models: readonly ScratchModel[],
  voxelIdOf: (color: number) => string,
  sectionSize: VolumeSize,
): ScratchLayout {
  if (sectionSize.x < 1) throw new Error('Section size must be positive');

  let total = 0;
  for (const model of models) total += model.voxels.length;
  const positions = new Int32Array(total * 3);
  const voxelIds = new Uint16Array(total);
  const palette: string[] = [];
  const indexById = new Map<string, number>();
  const indexByColor = new Map<number, number>();

  const paletteIndexOf = (color: number): number => {
    const known = indexByColor.get(color);
    if (known !== undefined) return known;
    const id = voxelIdOf(color);
    let index = indexById.get(id);
    if (index === undefined) {
      index = palette.length;
      if (index > 0xffff) {
        throw new Error(`More than ${0x1_0000} distinct voxel ids cannot be packed`);
      }
      palette.push(id);
      indexById.set(id, index);
    }
    indexByColor.set(color, index);
    return index;
  };

  const regions: ScratchRegion[] = [];
  let cursor = 0;
  let write = 0;
  for (const model of models) {
    const span = alignUp(Math.max(model.width, 1), sectionSize.x);
    regions.push({
      id: model.id,
      x: cursor,
      endX: cursor + span,
      ...(model.scale === undefined ? {} : { scale: model.scale }),
      ...(model.source === undefined ? {} : { source: model.source }),
    });
    for (const voxel of model.voxels) {
      positions[write * 3] = cursor + voxel.x;
      positions[write * 3 + 1] = voxel.y;
      positions[write * 3 + 2] = voxel.z;
      voxelIds[write] = paletteIndexOf(voxel.color);
      write++;
    }
    // One empty section of padding: adjacent models must not see each other.
    cursor += span + sectionSize.x;
  }
  return { writes: { positions, voxelIds, palette }, regions, extentX: cursor };
}

/** The region a meshed section belongs to, found by its x origin. */
export function regionOwning(
  regions: readonly ScratchRegion[],
  originX: number,
): ScratchRegion | undefined {
  return regions.find((region) => originX >= region.x && originX < region.endX);
}
