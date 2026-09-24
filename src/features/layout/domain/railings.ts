import { CLIMBS, climbAt, type PavedProvider } from './stairs';
import { spanAt, type SpanProvider } from './spans';
import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import { normalizeRotation, type Rotation } from './rotation';

export interface WaterProvider {
  (tileX: number, tileZ: number): boolean;
}

const NO_WATER: WaterProvider = () => false;

const NO_SPAN: SpanProvider = () => false;

export type RailKind = 'flight' | 'edge' | 'pier' | 'span' | 'ramp-left' | 'ramp-right';

export interface RailTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
  readonly kind: RailKind;
}

function flanksOf(climb: Rotation): Rotation[] {
  return [normalizeRotation(climb + 1), normalizeRotation(climb + 3)];
}

function stepOf(rotation: Rotation): { readonly dx: number; readonly dz: number } {
  const climb = CLIMBS.find((candidate) => candidate.rotation === rotation)!;
  return { dx: climb.dx, dz: climb.dz };
}

// The tile itself is not checked for paving: every caller only asks about tiles it paves.
export function railsAt(
  tile: Tile,
  isPaved: PavedProvider,
  levelOf: LevelProvider,
  isWater: WaterProvider = NO_WATER,
  isSpan: SpanProvider = NO_SPAN,
): RailTile[] {
  // Spans take their own parapets: an ordinary rail stands at the tile's ground
  // height, which for a bridge is in the river.
  if (isSpan(tile.x, tile.z)) return spanRailsAt(tile, isPaved, isSpan);
  const climb = climbAt(tile, isPaved, levelOf);
  if (climb !== null) {
    // Both flanks or neither: one model carries the pair, so a wide staircase is
    // left open rather than railed down its treads.
    const alone = flanksOf(climb).every((flank) => {
      const { dx, dz } = stepOf(flank);
      return !isPaved(tile.x + dx, tile.z + dz);
    });
    return alone ? [{ tile, rotation: climb, kind: 'flight' }] : [];
  }

  const level = levelOf(tile.x, tile.z);
  // Pier rails carry a lantern, being walked out into the dark. Open water counts
  // as a drop: pier and sea are both at sea level, so the heights alone say nothing.
  const kind: RailKind = isWater(tile.x, tile.z) ? 'pier' : 'edge';
  return CLIMBS.filter(({ dx, dz }) => {
    const beside = { x: tile.x + dx, z: tile.z + dz };
    if (isPaved(beside.x, beside.z)) return false;
    return levelOf(beside.x, beside.z) < level || isWater(beside.x, beside.z);
  }).map(({ rotation }) => ({ tile, rotation, kind }));
}

function spanRailsAt(tile: Tile, isPaved: PavedProvider, isSpan: SpanProvider): RailTile[] {
  const span = spanAt(tile, isPaved, isSpan);
  const kindOf = (edge: Rotation): RailKind => {
    if (span.kind === 'deck') return 'span';
    // A quarter turn on from the bank is the right flank looking up the climb.
    const offset = normalizeRotation(edge - span.rotation);
    return offset === 1 ? 'ramp-right' : offset === 3 ? 'ramp-left' : 'span';
  };
  return CLIMBS.filter(({ dx, dz }) => !isPaved(tile.x + dx, tile.z + dz)).map(({ rotation }) => ({
    tile,
    rotation,
    kind: kindOf(rotation),
  }));
}

export function railTilesFor(
  paved: readonly Tile[],
  levelOf: LevelProvider,
  isWater: WaterProvider = NO_WATER,
  isSpan: SpanProvider = NO_SPAN,
): RailTile[] {
  const pavedKeys = new Set(paved.map((tile) => `${tile.x},${tile.z}`));
  const isPaved: PavedProvider = (tileX, tileZ) => pavedKeys.has(`${tileX},${tileZ}`);
  return paved.flatMap((tile) => railsAt(tile, isPaved, levelOf, isWater, isSpan));
}
