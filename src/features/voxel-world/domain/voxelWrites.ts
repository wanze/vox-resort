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
