// Kept out of OBJECT_TYPES: balloons have no footprint and must never be offered
// on the palette or placed by the generator.

import type { VoxelModelSource } from '../voxelgen.ts';
import balloon_amber from './balloon-amber.ts';
import balloon_bloom from './balloon-bloom.ts';
import balloon_paper from './balloon-paper.ts';

export const SKY_SOURCES: readonly VoxelModelSource[] = [
  balloon_bloom,
  balloon_amber,
  balloon_paper,
];
