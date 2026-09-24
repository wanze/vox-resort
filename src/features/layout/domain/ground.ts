import { terraceAt, type Elevation, type TerraceSurface } from './elevation';
import { terrainAt, type Shore } from './shoreline';

export type Ground = TerraceSurface | 'water';

export function groundAt(
  shore: Shore | null,
  elevation: Elevation | null,
  tileX: number,
  tileZ: number,
): Ground {
  const terrain = terrainAt(shore, tileX, tileZ);
  if (terrain === 'water') return 'water';
  const terrace = terraceAt(elevation, tileX, tileZ);
  if (terrace) return terrace.surface ?? 'grass';
  return terrain === 'beach' ? 'sand' : 'grass';
}

export function isSandGround(
  shore: Shore | null,
  elevation: Elevation | null,
  tileX: number,
  tileZ: number,
): boolean {
  return groundAt(shore, elevation, tileX, tileZ) === 'sand';
}
