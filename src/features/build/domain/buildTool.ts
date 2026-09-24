import type { TerrainBrush } from './terrainBrush';

export interface ObjectTool {
  readonly kind: 'object';
  readonly id: string;
}

export interface TerrainTool {
  readonly kind: 'terrain';
  readonly brush: TerrainBrush;
}

export interface RemoveTool {
  readonly kind: 'remove';
}

export type BuildTool = ObjectTool | TerrainTool | RemoveTool;

export const BULLDOZER = {
  label: 'Bulldozer',
  hint: 'Take away whatever stands on a tile',
  glyph: '✕',
} as const;

export function armedRemove(tool: BuildTool | null): boolean {
  return tool?.kind === 'remove';
}

export function armedObject(tool: BuildTool | null): string | null {
  return tool?.kind === 'object' ? tool.id : null;
}

export function armedBrush(tool: BuildTool | null): TerrainBrush | null {
  return tool?.kind === 'terrain' ? tool.brush : null;
}
