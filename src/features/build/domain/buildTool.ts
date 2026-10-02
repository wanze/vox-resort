import type { TerrainBrush } from './terrainBrush';

// A model id, or null to roll a style for every placement.
export type StylePick = string | null;

// The id is the family's. Left out, the style is the family's remembered pick; null rolls.
export interface ObjectTool {
  readonly kind: 'object';
  readonly id: string;
  readonly style?: StylePick;
}

export interface TerrainTool {
  readonly kind: 'terrain';
  readonly brush: TerrainBrush;
}

export interface RemoveTool {
  readonly kind: 'remove';
}

// NO_ZONE erases.
export interface ZoneTool {
  readonly kind: 'zone';
  readonly zone: number;
}

export interface LandTool {
  readonly kind: 'land';
}

export type BuildTool = ObjectTool | TerrainTool | RemoveTool | ZoneTool | LandTool;

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

export function armedZone(tool: BuildTool | null): number | null {
  return tool?.kind === 'zone' ? tool.zone : null;
}

export function armedLand(tool: BuildTool | null): boolean {
  return tool?.kind === 'land';
}
