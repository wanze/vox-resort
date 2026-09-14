/**
 * A model re-voxelised at a coarser grid: what is drawn once the real one is too
 * small on screen for its detail to show.
 *
 * Derived rather than authored, so every model in `voxel-gen/` gets one by
 * existing. Each block of `scale`³ voxels becomes one voxel:
 *
 * - **Solid if anything in it is.** A lamp post one voxel thick stays a post
 *   (two voxels thick) rather than vanishing, and no wall opens a hole. What it
 *   costs is a silhouette up to one coarse voxel fatter, which is below the pixel
 *   the level is chosen at. See `rendering/domain/levelOfDetail.ts`.
 * - **The colour most of it is.** Ties go to the colour the block saw first, so
 *   the result is the same every run. Colours are never mixed: the emissive,
 *   water and window surfaces are told apart by colour, and a blend would belong
 *   to none of them.
 *
 * The coarse model is meshed in its own scratch region at coarse coordinates and
 * scaled back up when its attributes are built, so it lands in exactly the space
 * the full model occupies and can share its instance matrices.
 */

import type { PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
import type { ScratchModel } from './modelScratch';

/** Voxels one coarse voxel spans along each axis. */
export const COARSE_SCALE = 2;

/** What a coarse model's id is suffixed with, so the two can be paired again. */
const COARSE_SUFFIX = '~coarse';

export const coarseIdOf = (id: string): string => `${id}${COARSE_SUFFIX}`;

/** The full model a coarse id was made from, or null if it is not a coarse id. */
export function fullIdOf(id: string): string | null {
  return id.endsWith(COARSE_SUFFIX) ? id.slice(0, -COARSE_SUFFIX.length) : null;
}

/** Room for a model 4 096 voxels along each axis, far beyond any in the catalogue. */
const AXIS = 4096;

interface Block {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly colors: number[];
  readonly counts: number[];
}

/** One map key per coarse block, refusing a block the key cannot hold. */
function blockKeyOf(x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= AXIS || y >= AXIS || z >= AXIS) {
    throw new Error(`Block ${x},${y},${z} is outside what can be coarsened`);
  }
  return (x * AXIS + y) * AXIS + z;
}

/** Counts one more voxel of `color` in a block. */
function tally(block: Block, color: number): void {
  const at = block.colors.indexOf(color);
  if (at === -1) {
    block.colors.push(color);
    block.counts.push(1);
  } else {
    block.counts[at]!++;
  }
}

/** The colour most of a block is, the first seen winning a tie. */
function majorityOf(block: Block): number {
  let best = 0;
  for (let index = 1; index < block.counts.length; index++) {
    if (block.counts[index]! > block.counts[best]!) best = index;
  }
  return block.colors[best]!;
}

export function coarsenVoxels(
  voxels: readonly PaintedVoxel[],
  scale: number = COARSE_SCALE,
): PaintedVoxel[] {
  if (scale < 1 || !Number.isInteger(scale)) throw new Error(`Cannot coarsen by ${scale}`);
  const blocks = new Map<number, Block>();
  for (const voxel of voxels) {
    const x = Math.floor(voxel.x / scale);
    const y = Math.floor(voxel.y / scale);
    const z = Math.floor(voxel.z / scale);
    const key = blockKeyOf(x, y, z);
    let block = blocks.get(key);
    if (!block) {
      block = { x, y, z, colors: [], counts: [] };
      blocks.set(key, block);
    }
    tally(block, voxel.color);
  }
  return [...blocks.values()].map((block) => ({
    x: block.x,
    y: block.y,
    z: block.z,
    color: majorityOf(block),
  }));
}

/**
 * The scratch model a full model's coarse copy is meshed from: coarse voxels,
 * a coarse width, scaled back up by `scale`, with its surfaces decided by the
 * colours the full model declared.
 */
export function coarseScratchModelOf(
  model: ScratchModel,
  scale: number = COARSE_SCALE,
): ScratchModel {
  return {
    id: coarseIdOf(model.id),
    width: Math.ceil(model.width / scale),
    voxels: coarsenVoxels(model.voxels, scale),
    scale,
    source: model.id,
  };
}
