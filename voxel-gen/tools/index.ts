import type { VoxelModelSource } from '../voxelgen.ts';
import tool_bulldozer from './tool-bulldozer.ts';
import tool_grass from './tool-grass.ts';
import tool_land from './tool-land.ts';
import tool_lower from './tool-lower.ts';
import tool_raise from './tool-raise.ts';
import tool_sand from './tool-sand.ts';
import tool_water from './tool-water.ts';

// Pictures for the build palette's tools: never offered, never placed, never drawn in the world.
export const TOOL_SOURCES: readonly VoxelModelSource[] = [
  tool_raise,
  tool_lower,
  tool_grass,
  tool_sand,
  tool_water,
  tool_bulldozer,
  tool_land,
];
