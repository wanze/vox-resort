/**
 * One painted voxel, in the coordinates the DVE adapter replays.
 *
 * Writes used to be produced per placement, one copy of a model's voxels for
 * every cottage on the plot. The scene is instanced now, so the only writes
 * anyone makes are the ones `modelScratch.ts` lays out to mesh each model once.
 */

export interface VoxelWrite {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** DVE voxel id to paint at this position. */
  readonly voxelId: string;
}

/**
 * The same writes, packed for a worker.
 *
 * The catalogue is three quarters of a million voxels, and structured-cloning
 * that many small objects across a worker boundary costs more than the meshing
 * the worker was meant to take off the main thread. Packed into typed arrays the
 * same data transfers rather than copies, and the ids — of which there are a
 * couple of hundred distinct values, one per colour — become indices into a
 * palette sent alongside.
 */
export interface PackedVoxelWrites {
  /** x, y, z per write, interleaved. */
  readonly positions: Int32Array;
  /** Index into `palette` per write. */
  readonly voxelIds: Uint16Array;
  readonly palette: readonly string[];
}

export function packVoxelWrites(writes: readonly VoxelWrite[]): PackedVoxelWrites {
  const positions = new Int32Array(writes.length * 3);
  const voxelIds = new Uint16Array(writes.length);
  const palette: string[] = [];
  const indexById = new Map<string, number>();

  writes.forEach((write, index) => {
    positions[index * 3] = write.x;
    positions[index * 3 + 1] = write.y;
    positions[index * 3 + 2] = write.z;
    let paletteIndex = indexById.get(write.voxelId);
    if (paletteIndex === undefined) {
      paletteIndex = palette.length;
      if (paletteIndex > 0xffff) {
        throw new Error(`More than ${0x1_0000} distinct voxel ids cannot be packed`);
      }
      palette.push(write.voxelId);
      indexById.set(write.voxelId, paletteIndex);
    }
    voxelIds[index] = paletteIndex;
  });

  return { positions, voxelIds, palette };
}

export function unpackVoxelWrites(packed: PackedVoxelWrites): VoxelWrite[] {
  const { positions, voxelIds, palette } = packed;
  const writes: VoxelWrite[] = Array.from({ length: voxelIds.length });
  for (let index = 0; index < voxelIds.length; index++) {
    const voxelId = palette[voxelIds[index]!];
    if (voxelId === undefined) {
      throw new Error(`Write ${index} names palette entry ${voxelIds[index]}, which is not there`);
    }
    writes[index] = {
      x: positions[index * 3]!,
      y: positions[index * 3 + 1]!,
      z: positions[index * 3 + 2]!,
      voxelId,
    };
  }
  return writes;
}
