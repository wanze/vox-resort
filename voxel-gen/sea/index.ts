// Not in models/index.ts: nothing afloat has a tile footprint, and the generator would throw
// placing a boat in the sea.

import type { VoxelModelSource } from '../voxelgen.ts';
import buoy from './buoy.ts';
import pedalo from './pedalo.ts';
import rowboat from './rowboat.ts';
import sailboat from './sailboat.ts';

// The flotilla tells buoys from craft by this index: everything after the buoy is a craft.
export const BUOY_INDEX = 0;

export const PEDALO_INDEX = 3;

export const SEA_SOURCES: readonly VoxelModelSource[] = [buoy, rowboat, sailboat, pedalo];
