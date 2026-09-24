// Kept out of OBJECT_TYPES: litter has no footprint and must never be offered
// on the palette or placed by the generator.

import type { VoxelModelSource } from '../voxelgen.ts';
import litter_cup from './litter-cup.ts';
import litter_wrapper from './litter-wrapper.ts';

export const LITTER_SOURCES: readonly VoxelModelSource[] = [litter_cup, litter_wrapper];
