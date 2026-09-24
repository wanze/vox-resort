import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import type { Rotation } from './rotation';

// Order matters: an ambiguous corner is resolved north first.
export const CLIMBS: readonly {
  readonly dx: number;
  readonly dz: number;
  readonly rotation: Rotation;
}[] = [
  { dx: 0, dz: -1, rotation: 0 },
  { dx: -1, dz: 0, rotation: 1 },
  { dx: 0, dz: 1, rotation: 2 },
  { dx: 1, dz: 0, rotation: 3 },
];

export interface StairTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
}

export interface PavedProvider {
  (tileX: number, tileZ: number): boolean;
}

// The flight sits on the lower tile, so it ends flush with the paving above.
// The tile itself is not checked for paving: both callers only ask about a tile they are paving.
export function climbAt(
  tile: Tile,
  isPaved: PavedProvider,
  levelOf: LevelProvider,
): Rotation | null {
  const level = levelOf(tile.x, tile.z);
  const climb = CLIMBS.find(
    ({ dx, dz }) =>
      isPaved(tile.x + dx, tile.z + dz) && levelOf(tile.x + dx, tile.z + dz) === level + 1,
  );
  return climb ? climb.rotation : null;
}

export function stairTilesFor(paved: readonly Tile[], levelOf: LevelProvider): StairTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const isPaved: PavedProvider = (tileX, tileZ) => pavedKeys.has(`${tileX},${tileZ}`);
  const stairs: StairTile[] = [];
  for (const tile of paved) {
    const rotation = climbAt(tile, isPaved, levelOf);
    if (rotation !== null) stairs.push({ tile, rotation });
  }
  return stairs;
}
