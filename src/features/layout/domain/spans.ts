import type { Tile } from './resortLayout';
import type { Rotation } from './rotation';
import { CLIMBS, type PavedProvider } from './stairs';

// Inland water only: a span over the sea lies flat on it and needs no ramps.
export interface SpanProvider {
  (tileX: number, tileZ: number): boolean;
}

export type SpanKind = 'ramp' | 'deck';

export interface SpanTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
  readonly kind: SpanKind;
}

// A ramp turns to face the bank it comes off, the reverse of stairs.ts, which names a
// flight by the ground it climbs to. With banks on two sides it faces the first in compass order.
export function spanAt(tile: Tile, isPaved: PavedProvider, isSpan: SpanProvider): SpanTile {
  const spanned = (dx: number, dz: number): boolean =>
    isPaved(tile.x + dx, tile.z + dz) && isSpan(tile.x + dx, tile.z + dz);
  const bank = CLIMBS.find(
    ({ dx, dz }) => isPaved(tile.x + dx, tile.z + dz) && !isSpan(tile.x + dx, tile.z + dz),
  );
  if (bank) return { tile, rotation: bank.rotation, kind: 'ramp' };

  // Prefer the axis with span on both sides: it tells the run from the lane beside it on a
  // two-wide crossing. A lone span tile stays unturned until a neighbour goes down.
  const axis =
    CLIMBS.find(({ dx, dz }) => spanned(dx, dz) && spanned(-dx, -dz)) ??
    CLIMBS.find(({ dx, dz }) => spanned(dx, dz));
  return { tile, rotation: axis?.rotation ?? 0, kind: 'deck' };
}

export function spanTilesFor(paved: readonly Tile[], isSpan: SpanProvider): SpanTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const isPaved: PavedProvider = (tileX, tileZ) => pavedKeys.has(`${tileX},${tileZ}`);
  return paved
    .filter((tile) => isSpan(tile.x, tile.z))
    .map((tile) => spanAt(tile, isPaved, isSpan));
}
