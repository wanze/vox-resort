// Kept out of OBJECT_TYPES, as the litter is: a ball has no footprint and must never be offered
// on the palette or placed by the generator.

import type { VoxelModelSource } from '../voxelgen.ts';
import ball_basket from './ball-basket.ts';
import ball_tennis from './ball-tennis.ts';
import ball_volley from './ball-volley.ts';

export const PROP_SOURCES: readonly VoxelModelSource[] = [ball_tennis, ball_volley, ball_basket];
