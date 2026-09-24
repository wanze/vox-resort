import type { PaintedVoxel } from '../../../../voxel-gen/voxelgen.ts';
import type { ScratchModel } from './modelScratch';

export const COARSE_SCALE = 2;

const COARSE_SUFFIX = '~coarse';

export const coarseIdOf = (id: string): string => `${id}${COARSE_SUFFIX}`;

export function fullIdOf(id: string): string | null {
  return id.endsWith(COARSE_SUFFIX) ? id.slice(0, -COARSE_SUFFIX.length) : null;
}

const AXIS = 4096;

interface Block {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly colors: number[];
  readonly counts: number[];
}

function blockKeyOf(x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= AXIS || y >= AXIS || z >= AXIS) {
    throw new Error(`Block ${x},${y},${z} is outside what can be coarsened`);
  }
  return (x * AXIS + y) * AXIS + z;
}

function tally(block: Block, color: number): void {
  const at = block.colors.indexOf(color);
  if (at === -1) {
    block.colors.push(color);
    block.counts.push(1);
  } else {
    block.counts[at]!++;
  }
}

// Majority rather than a blend: emissive, water and window surfaces are told apart by colour.
// Ties go to the first colour seen so the result is deterministic.
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
