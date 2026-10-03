import type { TerrainBrush } from './terrainBrush';

export type ToolArtKey = TerrainBrush | 'remove' | 'land';

// Rendered from voxel-gen/tools/ by `pnpm preview`; the domain cannot import the models to check.
export const TOOL_ART: { readonly [key in ToolArtKey]: string } = {
  raise: 'tool-raise',
  lower: 'tool-lower',
  grass: 'tool-grass',
  sand: 'tool-sand',
  water: 'tool-water',
  remove: 'tool-bulldozer',
  land: 'tool-land',
};
