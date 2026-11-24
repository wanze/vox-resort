import type { LevelProvider } from './elevation';
import type { Tile } from './resortLayout';
import type { Rotation } from './rotation';
import { climbAt, CLIMBS, type PavedProvider } from './stairs';
import { pavedLookup } from './tileKey';

export type ClimbKind = 'stairs' | 'ramp-foot' | 'ramp-head';

export interface ClimbTile {
  readonly tile: Tile;
  readonly rotation: Rotation;
  readonly kind: ClimbKind;
}

type Climb = (typeof CLIMBS)[number];

const climbTowards = (rotation: Rotation): Climb =>
  CLIMBS.find((climb) => climb.rotation === rotation)!;

// Both halves of a ramp stand on the lower level, turned like the stairs they replace. A foot serves
// the first climb in CLIMBS order, so where two heads share it, the north one gets the ramp.
function footOf(
  tile: Tile,
  isPaved: PavedProvider,
  levelOf: LevelProvider,
  wantsStairs: PavedProvider,
): Climb | null {
  if (!isPaved(tile.x, tile.z) || wantsStairs(tile.x, tile.z)) return null;
  if (climbAt(tile, isPaved, levelOf) !== null) return null;
  const level = levelOf(tile.x, tile.z);
  return (
    CLIMBS.find(({ dx, dz, rotation }) => {
      const head: Tile = { x: tile.x + dx, z: tile.z + dz };
      return (
        isPaved(head.x, head.z) &&
        !wantsStairs(head.x, head.z) &&
        levelOf(head.x, head.z) === level &&
        climbAt(head, isPaved, levelOf) === rotation
      );
    }) ?? null
  );
}

// A ramp leaves no tread at ground height to walk along, so a head across a corridor would wall it
// off; there the flight stays. A flank climbing the same way is the next lane of a wide ramp.
function crossesCorridor(head: Tile, climb: Climb, isPaved: PavedProvider, levelOf: LevelProvider) {
  const level = levelOf(head.x, head.z);
  return CLIMBS.some(({ dx, dz }) => {
    if (dx === climb.dx || dz === climb.dz) return false;
    const flank: Tile = { x: head.x + dx, z: head.z + dz };
    if (!isPaved(flank.x, flank.z) || levelOf(flank.x, flank.z) !== level) return false;
    const above: Tile = { x: flank.x + climb.dx, z: flank.z + climb.dz };
    return !isPaved(above.x, above.z) || levelOf(above.x, above.z) !== level + 1;
  });
}

// Reads at most three tiles away: a head asks its foot, the foot asks the other heads it could serve
// whether they climb, and asks its own head's flanks. The tile asked counts as paved, as in climbAt.
export function climbKindAt(
  tile: Tile,
  isPaved: PavedProvider,
  levelOf: LevelProvider,
  wantsStairs: PavedProvider,
): ClimbTile | null {
  const paved: PavedProvider = (tileX, tileZ) =>
    (tileX === tile.x && tileZ === tile.z) || isPaved(tileX, tileZ);
  const rotation = climbAt(tile, paved, levelOf);
  if (rotation !== null) {
    const climb = climbTowards(rotation);
    const below: Tile = { x: tile.x - climb.dx, z: tile.z - climb.dz };
    const head =
      !wantsStairs(tile.x, tile.z) &&
      footOf(below, paved, levelOf, wantsStairs)?.rotation === rotation &&
      !crossesCorridor(tile, climb, paved, levelOf);
    return { tile, rotation, kind: head ? 'ramp-head' : 'stairs' };
  }
  const foot = footOf(tile, paved, levelOf, wantsStairs);
  if (!foot) return null;
  const head: Tile = { x: tile.x + foot.dx, z: tile.z + foot.dz };
  if (crossesCorridor(head, foot, paved, levelOf)) return null;
  return { tile, rotation: foot.rotation, kind: 'ramp-foot' };
}

export const CLIMB_REACH = 3;

// Along the climb from the tile: a flight runs from its own tile up to the next, a ramp's two halves
// from the foot up to the tile above the head. Both halves read the same tiles, so they agree.
const CLIMB_SPAN: { readonly [kind in ClimbKind]: readonly number[] } = {
  stairs: [0, 1],
  'ramp-foot': [0, 1, 2],
  'ramp-head': [-1, 0, 1],
};

// Sand under the whole climb is decking at both its ends, so the climb between is wood too.
export function isDeckedClimb(climb: ClimbTile, isDecked: PavedProvider): boolean {
  const { dx, dz } = climbTowards(climb.rotation);
  return CLIMB_SPAN[climb.kind].every((step) =>
    isDecked(climb.tile.x + dx * step, climb.tile.z + dz * step),
  );
}

export function climbTilesFor(
  paved: readonly Tile[],
  levelOf: LevelProvider,
  wantsStairs: PavedProvider,
): ClimbTile[] {
  const isPaved = pavedLookup(paved);
  const climbs: ClimbTile[] = [];
  for (const tile of paved) {
    const climb = climbKindAt(tile, isPaved, levelOf, wantsStairs);
    if (climb) climbs.push(climb);
  }
  return climbs;
}
