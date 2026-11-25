import { CLIMBS, type PavedProvider } from './stairs';
import { climbKindAt, isDeckedClimb } from './climbs';
import { spanAt, type SpanProvider } from './spans';
import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import { normalizeRotation, ROTATIONS, type Rotation } from './rotation';
import { pavedLookup } from './tileKey';

export interface WaterProvider {
  (tileX: number, tileZ: number): boolean;
}

const NO_WATER: WaterProvider = () => false;

const NO_SPAN: SpanProvider = () => false;

const NO_RAMPS: PavedProvider = () => true;

const NO_KERBS: PavedProvider = () => false;

const NO_DECKING: PavedProvider = () => false;

// Whether the edge of a tile facing `rotation` is the threshold of a door.
export interface DoorwayProvider {
  (tileX: number, tileZ: number, rotation: Rotation): boolean;
}

const NO_DOORWAYS: DoorwayProvider = () => false;

export type ClimbRailKind =
  `${'' | 'deck-'}${'flight' | 'ramp-foot' | 'ramp-head'}-${'left' | 'right'}`;

export type RailKind =
  | ClimbRailKind
  | 'edge'
  | 'deck-edge'
  | 'pier'
  | 'kerb'
  | 'kerb-post'
  | 'span'
  | 'ramp-left'
  | 'ramp-right';

export interface RailTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
  readonly kind: RailKind;
}

// A quarter turn on from the climb is the left flank looking up it.
const FLANKS = [
  { turn: 1, side: 'left' },
  { turn: 3, side: 'right' },
] as const;

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
  wantsStairs: PavedProvider = NO_RAMPS,
  isKerbed: PavedProvider = NO_KERBS,
  isDecked: PavedProvider = NO_DECKING,
  isDoorway: DoorwayProvider = NO_DOORWAYS,
): RailTile[] {
  // Spans take their own parapets: an ordinary rail stands at the tile's ground
  // height, which for a bridge is in the river.
  if (isSpan(tile.x, tile.z)) return spanRailsAt(tile, isPaved, isSpan);
  const climb = climbKindAt(tile, isPaved, levelOf, wantsStairs);
  if (climb !== null) {
    // Each flank on its own edge, so a wide staircase or ramp is railed down its outer flanks and
    // left open down its middle.
    const piece = climb.kind === 'stairs' ? 'flight' : climb.kind;
    const finish = isDeckedClimb(climb, isDecked) ? 'deck-' : '';
    return FLANKS.flatMap(({ turn, side }) => {
      const edge = normalizeRotation(climb.rotation + turn);
      const { dx, dz } = stepOf(edge);
      if (isPaved(tile.x + dx, tile.z + dz)) return [];
      return [{ tile, rotation: edge, kind: `${finish}${piece}-${side}` as const }];
    });
  }

  const level = levelOf(tile.x, tile.z);
  // Pier rails carry a lantern, being walked out into the dark. Open water counts
  // as a drop: pier and sea are both at sea level, so the heights alone say nothing.
  const kind: RailKind = isWater(tile.x, tile.z)
    ? 'pier'
    : isDecked(tile.x, tile.z)
      ? 'deck-edge'
      : 'edge';
  const drops = CLIMBS.filter(({ dx, dz }) => {
    const beside = { x: tile.x + dx, z: tile.z + dz };
    if (isPaved(beside.x, beside.z)) return false;
    return levelOf(beside.x, beside.z) < level || isWater(beside.x, beside.z);
  }).map(({ rotation }) => ({ tile, rotation, kind }));
  if (!isKerbed(tile.x, tile.z)) return drops;
  const isKerbedFlat: PavedProvider = (tileX, tileZ) =>
    isPaved(tileX, tileZ) &&
    isKerbed(tileX, tileZ) &&
    !isSpan(tileX, tileZ) &&
    climbKindAt({ x: tileX, z: tileZ }, isPaved, levelOf, wantsStairs) === null;
  return [...drops, ...kerbsAt(tile, { isPaved, isKerbedFlat, levelOf, isWater, isDoorway })];
}

export interface KerbGround {
  readonly isPaved: PavedProvider;
  // Paving a kerb runs along: level, on ground that takes a kerb, and neither a climb nor a span.
  readonly isKerbedFlat: PavedProvider;
  readonly levelOf: LevelProvider;
  readonly isWater: WaterProvider;
  readonly isDoorway: DoorwayProvider;
}

// Only where the ground beside is level: a drop takes a rail, and a rise has its own face. The tile
// itself is taken to be kerbed flat paving; every caller has asked that already.
export function kerbsAt(tile: Tile, ground: KerbGround): RailTile[] {
  const edges = CLIMBS.filter(({ rotation }) => kerbsEdge(tile, rotation, ground)).map(
    ({ rotation }) => ({ tile, rotation, kind: 'kerb' as const }),
  );
  return [...edges, ...kerbPostsAt(tile, ground)];
}

function kerbsEdge(tile: Tile, rotation: Rotation, ground: KerbGround): boolean {
  const { dx, dz } = stepOf(rotation);
  const beside = { x: tile.x + dx, z: tile.z + dz };
  if (ground.isPaved(beside.x, beside.z) || ground.isWater(beside.x, beside.z)) return false;
  if (ground.isDoorway(tile.x, tile.z, rotation)) return false;
  return ground.levelOf(beside.x, beside.z) === ground.levelOf(tile.x, tile.z);
}

// A corner post r stands between edges r and r + 1. Each kerb stops at its own tile's edge, so
// where the open ground touches this tile only at a corner, the two kerbs around it leave the
// corner voxel bare.
function kerbPostsAt(tile: Tile, ground: KerbGround): RailTile[] {
  return ROTATIONS.filter((corner) => {
    const across = normalizeRotation(corner + 1);
    const one = stepOf(corner);
    const other = stepOf(across);
    const first = { x: tile.x + one.dx, z: tile.z + one.dz };
    const second = { x: tile.x + other.dx, z: tile.z + other.dz };
    const level = ground.levelOf(tile.x, tile.z);
    return (
      ground.isKerbedFlat(first.x, first.z) &&
      ground.isKerbedFlat(second.x, second.z) &&
      ground.levelOf(first.x, first.z) === level &&
      ground.levelOf(second.x, second.z) === level &&
      kerbsEdge(first, across, ground) &&
      kerbsEdge(second, corner, ground)
    );
  }).map((corner) => ({ tile, rotation: corner, kind: 'kerb-post' as const }));
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
  wantsStairs: PavedProvider = NO_RAMPS,
  isKerbed: PavedProvider = NO_KERBS,
  isDecked: PavedProvider = NO_DECKING,
  isDoorway: DoorwayProvider = NO_DOORWAYS,
): RailTile[] {
  const isPaved = pavedLookup(paved);
  return paved.flatMap((tile) =>
    railsAt(tile, isPaved, levelOf, isWater, isSpan, wantsStairs, isKerbed, isDecked, isDoorway),
  );
}
