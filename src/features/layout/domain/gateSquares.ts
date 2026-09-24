import { rectTiles, type TileRect } from './parkShapes';
import type { Tile } from './resortLayout';

export type Inward = 'south' | 'east' | 'west';

export interface GateSquare {
  readonly plaza: TileRect;
  readonly sign: Tile | null;
  readonly beds: readonly Tile[];
}

export const GATE_SQUARE_DEPTH = 4;

function plazaInside(gate: TileRect, inward: Inward): TileRect {
  if (inward === 'south') {
    return { x0: gate.x0 - 1, x1: gate.x1 + 1, z0: gate.z1 + 1, z1: gate.z1 + GATE_SQUARE_DEPTH };
  }
  const x0 = inward === 'east' ? gate.x1 + 1 : gate.x0 - GATE_SQUARE_DEPTH;
  return { x0, x1: x0 + GATE_SQUARE_DEPTH - 1, z0: gate.z0 - 1, z1: gate.z1 + 1 };
}

function farCorners(plaza: TileRect, inward: Inward): Tile[] {
  if (inward === 'south') {
    return [
      { x: plaza.x0, z: plaza.z1 },
      { x: plaza.x1, z: plaza.z1 },
    ];
  }
  const x = inward === 'east' ? plaza.x1 : plaza.x0;
  return [
    { x, z: plaza.z0 },
    { x, z: plaza.z1 },
  ];
}

export function gateSquare(
  gate: TileRect,
  inward: Inward,
  isStreet: (tileX: number, tileZ: number) => boolean,
): GateSquare {
  const plaza = plazaInside(gate, inward);
  const free = (tile: Tile) => !isStreet(tile.x, tile.z);
  const beds = farCorners(plaza, inward).filter(free);
  const centre = { x: (gate.x0 + gate.x1) / 2, z: (gate.z0 + gate.z1) / 2 };
  const reach = (tile: Tile) => (tile.x - centre.x) ** 2 + (tile.z - centre.z) ** 2;
  const sign =
    rectTiles(plaza)
      .filter((tile) => free(tile) && !beds.some((bed) => bed.x === tile.x && bed.z === tile.z))
      .toSorted((a, b) => reach(a) - reach(b) || a.x - b.x || a.z - b.z)[0] ?? null;
  return { plaza, sign, beds };
}
