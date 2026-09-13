/**
 * What the pointer is holding: one object to stand, one brush to work the ground
 * with, or the bulldozer to take things away again.
 *
 * A union rather than two nullable fields, and that is the whole content of this
 * module. There is one pointer, one left mouse button and one cursor, so there
 * is exactly one armed tool — and two flags that had to be kept opposite would
 * be two flags that could both be set. Arming a brush disarms the object by
 * construction here, rather than by a rule somebody has to remember in the HUD,
 * in the showcase and in the palette.
 *
 * It lives in `domain/` so the palette can read it: a React component may not
 * reach into the app, and the tool a button arms is not a fact about the scene.
 */

import type { TerrainBrush } from './terrainBrush';

/** The object type the pointer will stand, by catalogue id. */
export interface ObjectTool {
  readonly kind: 'object';
  readonly id: string;
}

/** The brush the pointer will work the ground with. */
export interface TerrainTool {
  readonly kind: 'terrain';
  readonly brush: TerrainBrush;
}

/** The bulldozer: takes away whatever is standing, rather than standing anything. */
export interface RemoveTool {
  readonly kind: 'remove';
}

export type BuildTool = ObjectTool | TerrainTool | RemoveTool;

/**
 * The bulldozer as the palette offers it.
 *
 * Here rather than in the component for the reason `TERRAIN_BRUSHES` is: the
 * label and the hint are facts about the tool, and a shelf that held them would
 * be a second place to change them.
 */
export const BULLDOZER = {
  label: 'Bulldozer',
  hint: 'Take away whatever stands on a tile',
  glyph: '✕',
} as const;

/** Whether the bulldozer is armed, rather than an object or a brush. */
export function armedRemove(tool: BuildTool | null): boolean {
  return tool?.kind === 'remove';
}

/** The catalogue id armed, or null when a brush is armed or nothing is. */
export function armedObject(tool: BuildTool | null): string | null {
  return tool?.kind === 'object' ? tool.id : null;
}

/** The brush armed, or null when an object is armed or nothing is. */
export function armedBrush(tool: BuildTool | null): TerrainBrush | null {
  return tool?.kind === 'terrain' ? tool.brush : null;
}
