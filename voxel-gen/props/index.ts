// Kept out of OBJECT_TYPES, as the litter is: a ball or a wheelchair has no footprint and must never
// be offered on the palette or placed by the generator.

import type { VoxelModelSource } from '../voxelgen.ts';
import ball_basket from './ball-basket.ts';
import ball_golf from './ball-golf.ts';
import ball_tennis from './ball-tennis.ts';
import ball_volley from './ball-volley.ts';
import wheelchair from './wheelchair.ts';

export const PROP_SOURCES: readonly VoxelModelSource[] = [
  ball_tennis,
  ball_volley,
  ball_basket,
  ball_golf,
  wheelchair,
];
