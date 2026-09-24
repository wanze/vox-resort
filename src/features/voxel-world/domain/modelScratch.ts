import type { PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
import type { VolumeSize } from './sectionGrid';

export interface ScratchModel {
  readonly id: string;
  readonly width: number;
  readonly voxels: readonly PaintedVoxel[];
  readonly scale?: number;
  readonly source?: string;
}

export interface ScratchRegion {
  readonly id: string;
  readonly x: number;
  readonly endX: number;
  readonly scale?: number;
  readonly source?: string;
}

// Packed into typed arrays so ~750k writes transfer to the worker instead of being
// structured-cloned, which cost more than the meshing itself.
export interface PackedVoxelWrites {
  readonly positions: Int32Array;
  readonly voxelIds: Uint16Array;
  readonly palette: readonly string[];
}

export interface ScratchLayout {
  readonly writes: PackedVoxelWrites;
  readonly regions: readonly ScratchRegion[];
  readonly extentX: number;
}

const alignUp = (value: number, step: number): number => Math.ceil(value / step) * step;

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

export function regionOwning(
  regions: readonly ScratchRegion[],
  originX: number,
): ScratchRegion | undefined {
  return regions.find((region) => originX >= region.x && originX < region.endX);
}
