import {
  derivedKey,
  place,
  type LayoutItem,
  type Placement,
  type Tile,
} from '../../layout/domain/resortLayout';
import { PAVING_IDS } from '../../layout/domain/resortPlan';
import { groundTakes } from '../../layout/domain/placementGround';
import type { LevelProvider } from '../../layout/domain/elevation';
import { climbAt, CLIMBS, type PavedProvider } from '../../layout/domain/stairs';
import { spanAt, type SpanProvider } from '../../layout/domain/spans';
import type { Rotation } from '../../layout/domain/rotation';
import type { TileOccupancy } from './tileOccupancy';

export interface PavedGround {
  (tileX: number, tileZ: number): LayoutItem | null;
}

export function isPaving(item: LayoutItem): boolean {
  return PAVING_IDS.has(item.id);
}

export function pavedGroundOf(
  occupancy: TileOccupancy,
  paving: readonly LayoutItem[],
): PavedGround {
  return (tileX, tileZ) => {
    const key = occupancy.keyAt({ x: tileX, z: tileZ });
    if (key === undefined) return null;
    return paving.find((item) => key === derivedKey(item.id, tileX, tileZ)) ?? null;
  };
}

export interface PavingRules {
  readonly pavedWith: PavedGround;
  readonly levelOf: LevelProvider;
  readonly isSand: (tileX: number, tileZ: number) => boolean;
  readonly isWater: (tileX: number, tileZ: number) => boolean;
  readonly isSea: (tileX: number, tileZ: number) => boolean;
  readonly decking: LayoutItem | null;
  readonly pier: LayoutItem | null;
  readonly bridge: LayoutItem | null;
  readonly bridgeRamp: LayoutItem | null;
  readonly stairs: LayoutItem | null;
  readonly flagstones: LayoutItem | null;
}

export interface Paving {
  readonly item: LayoutItem;
  readonly rotation: Rotation;
}

const pavedProvider =
  (rules: PavingRules): PavedProvider =>
  (tileX, tileZ) =>
    rules.pavedWith(tileX, tileZ) !== null;

// The climb is asked first, as in layoutResort: a step's lower tile can be the landward row of sand,
// and there the flight is right. Flat paving is laid unturned: a slab has no front.
export function pavingAt(
  item: LayoutItem,
  tile: Tile,
  rotation: Rotation,
  rules: PavingRules,
): Paving {
  if (!isPaving(item)) return { item, rotation };
  if (rules.isWater(tile.x, tile.z)) {
    const span = spanOver(tile, rules);
    if (span === null) return { item, rotation: 0 };
    // A pier is laid unturned, one tile of decking being every tile of it. A bridge has ends, asked of
    // spans.ts here and by layoutResort both, so a hand-drawn crossing lands where a generated one does.
    if (span.id !== rules.bridge?.id) return { item: span, rotation: 0 };
    const crossing = spanAt(tile, pavedProvider(rules), raisedProvider(rules));
    const ramp = crossing.kind === 'ramp' ? rules.bridgeRamp : null;
    return { item: ramp ?? span, rotation: crossing.rotation };
  }
  const { stairs } = rules;
  if (stairs) {
    const climb = climbAt(tile, pavedProvider(rules), rules.levelOf);
    if (climb !== null) return { item: stairs, rotation: climb };
  }
  const decking = rules.isSand(tile.x, tile.z) ? rules.decking : null;
  return { item: decking ?? item, rotation: 0 };
}

// One place, so pavingAt and standsOn cannot drift apart and stand a bridge on ground that refuses it.
function spanOver(tile: Tile, rules: PavingRules): LayoutItem | null {
  return rules.isSea(tile.x, tile.z) ? rules.pier : rules.bridge;
}

export const raisedProvider =
  (rules: PavingRules): SpanProvider =>
  (tileX, tileZ) =>
    rules.bridge !== null && rules.isWater(tileX, tileZ) && !rules.isSea(tileX, tileZ);

// A rule rather than a reservation in the occupancy index: what may stand on water is a fact about
// the object, and an index of tiles cannot hold that.
export function standsOn(item: LayoutItem, tile: Tile, rules: PavingRules): boolean {
  if (!groundTakes(item.ground, rules, tile.x, tile.z)) return false;
  if (!rules.isWater(tile.x, tile.z)) return true;
  const span = spanOver(tile, rules);
  if (span === null) return false;
  return item.id === span.id || (span.id === rules.bridge?.id && item.id === rules.bridgeRamp?.id);
}

export interface Relaid {
  readonly placement: Placement;
  readonly lifted: Placement;
}

// Asked after the tile is laid, so it counts as paved. The lifted slab is rebuilt rather than looked
// up: flat paving is always unturned at its own tile's level.
export function relaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  if (rules.pavedWith(tile.x, tile.z) === null) return [];
  return relayBeside(tile, rules, (beside, slab, isPaved, isRaised) =>
    isRaised(beside.x, beside.z)
      ? spanBeside(beside, rules, isPaved, isRaised)
      : flightBeside(beside, slab, rules, isPaved),
  );
}

// Re-laid whatever the answer: a flight's facing is not on the index, so a correct one cannot be told
// from a wrong one.
export function unlaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  return relayBeside(tile, rules, (beside, standing, isPaved, isRaised) => {
    if (isRaised(beside.x, beside.z)) return spanBeside(beside, rules, isPaved, isRaised);
    if (standing.id !== rules.stairs?.id) return null;
    return flightOrFlat(beside, rules, isPaved);
  });
}

interface RelayRule {
  (
    beside: Tile,
    standing: LayoutItem,
    isPaved: PavedProvider,
    isRaised: SpanProvider,
  ): Paving | null;
}

function relayBeside(tile: Tile, rules: PavingRules, rule: RelayRule): Relaid[] {
  const isPaved = pavedProvider(rules);
  const isRaised = raisedProvider(rules);
  const relaid: Relaid[] = [];
  for (const { dx, dz } of CLIMBS) {
    const beside: Tile = { x: tile.x + dx, z: tile.z + dz };
    const slab = rules.pavedWith(beside.x, beside.z);
    if (!slab) continue;
    const laid = rule(beside, slab, isPaved, isRaised);
    if (!laid) continue;
    const level = rules.levelOf(beside.x, beside.z);
    relaid.push({
      placement: place(
        laid.item,
        derivedKey(laid.item.id, beside.x, beside.z),
        beside.x,
        beside.z,
        laid.rotation,
        level,
      ),
      lifted: place(slab, derivedKey(slab.id, beside.x, beside.z), beside.x, beside.z, 0, level),
    });
  }
  return relaid;
}

// Re-asked every time: the answer includes the tile's turn, so there is no settled state to stop at.
function spanBeside(
  tile: Tile,
  rules: PavingRules,
  isPaved: PavedProvider,
  isRaised: SpanProvider,
): Paving | null {
  const { bridge } = rules;
  if (!bridge) return null;
  const crossing = spanAt(tile, isPaved, isRaised);
  const item = crossing.kind === 'ramp' ? (rules.bridgeRamp ?? bridge) : bridge;
  return { item, rotation: crossing.rotation };
}

// A tile already a flight is left alone: re-facing it would only move the fudge an L-bend was
// resolved with.
function flightBeside(
  tile: Tile,
  slab: LayoutItem,
  rules: PavingRules,
  isPaved: PavedProvider,
): Paving | null {
  const { stairs } = rules;
  if (!stairs || slab.id === stairs.id) return null;
  const climb = climbAt(tile, isPaved, rules.levelOf);
  return climb === null ? null : { item: stairs, rotation: climb };
}

function flightOrFlat(tile: Tile, rules: PavingRules, isPaved: PavedProvider): Paving | null {
  const climb = climbAt(tile, isPaved, rules.levelOf);
  if (climb !== null) return { item: rules.stairs!, rotation: climb };
  const decking = rules.isSand(tile.x, tile.z) ? rules.decking : null;
  const flat = decking ?? rules.flagstones;
  return flat === null ? null : { item: flat, rotation: 0 };
}
