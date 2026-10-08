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
import { CLIMBS, type PavedProvider } from '../../layout/domain/stairs';
import { CLIMB_REACH, climbKindAt, type ClimbKind } from '../../layout/domain/climbs';
import { spanAt, type SpanProvider } from '../../layout/domain/spans';
import { borderedSides, type MosaicKit } from '../../layout/domain/mosaic';
import type { Rotation } from '../../layout/domain/rotation';
import { tileKey } from '../../layout/domain/tileKey';
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
  readonly staircase: LayoutItem | null;
  readonly rampFoot: LayoutItem | null;
  readonly rampHead: LayoutItem | null;
  readonly flagstones: LayoutItem | null;
  readonly mosaic: MosaicKit | null;
}

export interface Paving {
  readonly item: LayoutItem;
  readonly rotation: Rotation;
}

const pavedProvider =
  (rules: PavingRules): PavedProvider =>
  (tileX, tileZ) =>
    rules.pavedWith(tileX, tileZ) !== null;

const isStaircase = (item: LayoutItem | null, rules: PavingRules): boolean =>
  item !== null && item.id === rules.staircase?.id;

// Water never takes a ramp, as in layoutResort, and without both halves nothing does.
export const wantsStairsOf =
  (rules: PavingRules): PavedProvider =>
  (tileX, tileZ) =>
    rules.rampFoot === null ||
    rules.rampHead === null ||
    rules.isWater(tileX, tileZ) ||
    isStaircase(rules.pavedWith(tileX, tileZ), rules);

function climbItemOf(kind: ClimbKind, chosen: boolean, rules: PavingRules): LayoutItem | null {
  if (kind === 'ramp-foot') return rules.rampFoot;
  if (kind === 'ramp-head') return rules.rampHead;
  return chosen ? rules.staircase : rules.stairs;
}

function climbOn(
  tile: Tile,
  chosen: boolean,
  rules: PavingRules,
  isPaved: PavedProvider,
  wantsStairs: PavedProvider,
): Paving | null {
  const climb = climbKindAt(tile, isPaved, rules.levelOf, wantsStairs);
  const item = climb && climbItemOf(climb.kind, chosen, rules);
  return item ? { item, rotation: climb.rotation } : null;
}

// The climb is asked first, as in layoutResort: a step's lower tile can be the landward row of sand,
// and there the flight is right. Flat paving is laid unturned, a slab having no front, unless it is
// a mosaic piece, turned to the sides it borders.
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
  const chosen = isStaircase(item, rules);
  const others = wantsStairsOf(rules);
  const wantsStairs: PavedProvider = (tileX, tileZ) =>
    tileX === tile.x && tileZ === tile.z ? chosen || others(tileX, tileZ) : others(tileX, tileZ);
  const climb = climbOn(tile, chosen, rules, pavedProvider(rules), wantsStairs);
  if (climb) return climb;
  const decking = rules.isSand(tile.x, tile.z) ? rules.decking : null;
  const flat = chosen ? (rules.flagstones ?? item) : item;
  if (decking) return { item: decking, rotation: 0 };
  return mosaicOn(flat, tile, rules) ?? { item: flat, rotation: 0 };
}

const styleAtOf =
  (kit: MosaicKit, pavedWith: PavedGround) =>
  (tileX: number, tileZ: number): string | null => {
    const standing = pavedWith(tileX, tileZ);
    return standing && kit.styleOf(standing.id);
  };

// The one flat paving with a front: its piece and turn are the sides it borders.
function mosaicOn(item: LayoutItem, tile: Tile, rules: PavingRules): Paving | null {
  const kit = rules.mosaic;
  const style = kit?.styleOf(item.id) ?? null;
  if (kit === null || style === null) return null;
  return kit.pieceFor(style, borderedSides(tile, style, styleAtOf(kit, rules.pavedWith)));
}

// Only a mosaic tool repaves, so a path drawn across a plaza cannot strip it; and only flat ground
// laid in mosaic, so decking or a flight is never stood over the paving it would have replaced.
export function repaves(
  item: LayoutItem,
  standing: LayoutItem | null,
  laid: Paving,
  rules: PavingRules,
): boolean {
  const kit = rules.mosaic;
  const style = kit?.styleOf(item.id) ?? null;
  if (!kit || style === null || standing === null || kit.styleOf(laid.item.id) === null) {
    return false;
  }
  const under = kit.styleOf(standing.id);
  return under === null ? standing.id === rules.flagstones?.id : under !== style;
}

export function fellBackToStairs(laid: Paving, rules: PavingRules): boolean {
  return laid.item.id === rules.stairs?.id && rules.rampFoot !== null && rules.rampHead !== null;
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

const CLIMB_PIECES = (rules: PavingRules): ReadonlySet<string | undefined> =>
  new Set([rules.stairs?.id, rules.staircase?.id, rules.rampFoot?.id, rules.rampHead?.id]);

const SPAN = 2 * CLIMB_REACH + 1;

// Every tile a climb could read, since a ramp's head depends on paving three tiles off. The four
// beside come first, in CLIMBS order, as they did when they were all a re-lay asked.
const REACH: readonly { readonly dx: number; readonly dz: number; readonly beside: boolean }[] = [
  ...CLIMBS.map(({ dx, dz }) => ({ dx, dz, beside: true })),
  ...Array.from({ length: SPAN * SPAN }, (_, index) => ({
    dx: (index % SPAN) - CLIMB_REACH,
    dz: Math.floor(index / SPAN) - CLIMB_REACH,
    beside: false,
  })).filter(({ dx, dz }) => {
    const away = Math.abs(dx) + Math.abs(dz);
    return away > 1 && away <= CLIMB_REACH;
  }),
];

// Asked after the tile is laid, so it counts as paved. A staircase stays as the player put it.
export function relaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  if (rules.pavedWith(tile.x, tile.z) === null) return [];
  return relayAround(tile, rules, { paved: false, keepStaircase: true });
}

export function unlaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  return relayAround(tile, rules, { paved: true, keepStaircase: false });
}

interface Before {
  readonly paved: boolean;
  readonly keepStaircase: boolean;
}

interface Relay {
  readonly rules: PavingRules;
  readonly isPaved: PavedProvider;
  readonly wasPaved: PavedProvider;
  readonly isRaised: SpanProvider;
  readonly wantsStairs: PavedProvider;
  readonly climbing: ReadonlySet<string | undefined>;
  readonly keepStaircase: boolean;
}

function relayAround(tile: Tile, plain: PavingRules, before: Before): Relaid[] {
  const rules: PavingRules = { ...plain, pavedWith: remembered(plain.pavedWith) };
  const isPaved = pavedProvider(rules);
  const relay: Relay = {
    rules,
    isPaved,
    wasPaved: (tileX, tileZ) =>
      tileX === tile.x && tileZ === tile.z ? before.paved : isPaved(tileX, tileZ),
    isRaised: raisedProvider(rules),
    wantsStairs: wantsStairsOf(rules),
    climbing: CLIMB_PIECES(rules),
    keepStaircase: before.keepStaircase,
  };
  const relaid: Relaid[] = [];
  for (const { dx, dz, beside: next } of REACH) {
    const beside: Tile = { x: tile.x + dx, z: tile.z + dz };
    const standing = rules.pavedWith(beside.x, beside.z);
    const laid = standing && relaidOn(beside, standing, next, relay);
    if (laid) relaid.push(relaidAs(laid, standing, beside, rules.levelOf(beside.x, beside.z)));
  }
  return relaid;
}

function relaidOn(beside: Tile, standing: LayoutItem, next: boolean, relay: Relay): Paving | null {
  if (relay.isRaised(beside.x, beside.z)) {
    return next ? spanBeside(beside, relay.rules, relay.isPaved, relay.isRaised) : null;
  }
  if (relay.keepStaircase && isStaircase(standing, relay.rules)) return null;
  return climbMoved(beside, standing, relay);
}

// Answered twice, before the edit and after it, because a climb's turn is not on the index: a tile
// still the same piece is re-laid only if its turn has moved. Flat paving never changes kind here.
function climbMoved(beside: Tile, standing: LayoutItem, relay: Relay): Paving | null {
  const { rules, climbing } = relay;
  const chosen = isStaircase(standing, rules);
  const now = settledOn(beside, chosen, rules, relay.isPaved, relay.wantsStairs);
  if (now === null) return null;
  const turned = climbing.has(now.item.id);
  if (!turned && !climbing.has(standing.id)) return null;
  if (now.item.id !== standing.id) return now;
  if (!turned) return null;
  const then = settledOn(beside, chosen, rules, relay.wasPaved, relay.wantsStairs);
  return then?.item.id === now.item.id && then.rotation === now.rotation ? null : now;
}

function relaidAs(laid: Paving, standing: LayoutItem, tile: Tile, level: number): Relaid {
  return {
    placement: place(
      laid.item,
      derivedKey(laid.item.id, tile.x, tile.z),
      tile.x,
      tile.z,
      laid.rotation,
      level,
    ),
    lifted: place(standing, derivedKey(standing.id, tile.x, tile.z), tile.x, tile.z, 0, level),
  };
}

// Two dozen tiles each read their neighbourhood, some twice, so the index is asked once per tile.
function remembered(pavedWith: PavedGround): PavedGround {
  const known = new Map<string, LayoutItem | null>();
  return (tileX, tileZ) => {
    const key = tileKey(tileX, tileZ);
    let item = known.get(key);
    if (item === undefined) {
      item = pavedWith(tileX, tileZ);
      known.set(key, item);
    }
    return item;
  };
}

function settledOn(
  tile: Tile,
  chosen: boolean,
  rules: PavingRules,
  isPaved: PavedProvider,
  wantsStairs: PavedProvider,
): Paving | null {
  const climb = climbOn(tile, chosen, rules, isPaved, wantsStairs);
  if (climb) return climb;
  const decking = rules.isSand(tile.x, tile.z) ? rules.decking : null;
  const flat = decking ?? rules.flagstones;
  return flat === null ? null : { item: flat, rotation: 0 };
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

export const mosaicStyleOf = (
  paved: { readonly id: string } | null,
  rules: PavingRules,
): string | null => (paved && rules.mosaic ? rules.mosaic.styleOf(paved.id) : null);

export interface Edited {
  readonly tile: Tile;
  // The mosaic style the tile stood in before the edit, null for anything else.
  readonly before: string | null;
}

// Compared before and after, because a piece's turn is not on the index, as in climbMoved: a
// neighbour is re-laid only where the changed tile joined or left its style, which moves its fit.
export function remosaicked(
  edited: Edited,
  relaid: readonly Relaid[],
  rules: PavingRules,
): Relaid[] {
  const kit = rules.mosaic;
  if (kit === null) return [];
  const styleAt = styleAtOf(kit, rules.pavedWith);
  const changed: Edited[] = [
    edited,
    ...relaid.map(({ placement, lifted }) => ({
      tile: { x: placement.tileX, z: placement.tileZ },
      before: kit.styleOf(lifted.id),
    })),
  ];
  const seen = new Set<string>();
  const result: Relaid[] = [];
  for (const { tile, before } of changed) {
    const now = styleAt(tile.x, tile.z);
    for (const { dx, dz } of CLIMBS) {
      const beside: Tile = { x: tile.x + dx, z: tile.z + dz };
      const standing = rules.pavedWith(beside.x, beside.z);
      const style = standing && kit.styleOf(standing.id);
      const key = tileKey(beside.x, beside.z);
      if (!standing || !style || seen.has(key) || (before === style) === (now === style)) continue;
      seen.add(key);
      const fit = kit.pieceFor(style, borderedSides(beside, style, styleAt));
      if (fit) result.push(relaidAs(fit, standing, beside, rules.levelOf(beside.x, beside.z)));
    }
  }
  return result;
}
