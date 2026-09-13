/**
 * What a tile of paving turns out to be once the ground under it has had its
 * say, as a path is drawn by hand.
 *
 * `layoutResort` already lays an authored plan this way: paving is a fact about
 * the ground under a tile rather than about the route over it, so the same
 * street is flagstones on grass, decking on sand and a flight of stairs where it
 * climbs a terrace step. This is that rule for the pointer, one tile at a time,
 * and it asks `stairs.ts` the same question the layout does — a path drawn
 * across a step climbs it exactly where a generated one would.
 *
 * **You do not place a flight, a boardwalk, a pier or a bridge, you draw a
 * path.** All four can only ever be wrong when picked by hand: a staircase on
 * flat ground climbs nothing, one facing the wrong way walks into a wall,
 * decking laid on a lawn is a jetty over grass, a jetty laid on grass is the
 * same joke the other way round, and a bridge over a lawn is a bridge over
 * nothing. All four models say as much about themselves (`groundDecides`), so
 * the palette offers none of them and this decides where they go — which leaves
 * one paving tool, and no way to pave a tile wrongly with it.
 *
 * Sand is the easy half: what a tile is made of is a fact about that tile alone,
 * so decking is decided once, as the tile goes down, and never revisited. A step
 * is not, and neither is a crossing — both are facts about two tiles, and a
 * stroke can cross either in whichever direction — so those decisions have two
 * halves:
 *
 * - {@link pavingAt} answers for the tile being paved. Drawing *downhill*, the
 *   tile is the lower one and the paving above it is already there, so the tile
 *   itself comes out as the flight; and the first tile of water past a bank that
 *   is already paved comes out as the ramp onto the bridge.
 * - {@link relaidBy} answers for the tiles already laid. Drawing *uphill*, the
 *   lower tile went down as an ordinary slab a moment ago and only becomes a
 *   flight once the tile above it is paved — so it is lifted and laid again. The
 *   far bank of a river is the same thing: the last tile of water went down as a
 *   level deck because there was nothing ashore of it yet, and paving that bank
 *   is what turns it into the ramp.
 *
 * Between them a stroke comes out the same whichever way it was drawn, and so
 * does a step or a crossing paved by two separate strokes days apart. Nothing
 * here has to know which gesture is running.
 *
 * Laying paving only ever makes more stairs, never fewer: paving a tile can turn
 * a slab into a flight, and no tile that is already a flight stops being one, so
 * a tile `relaidBy` re-lays is always a slab. Taking paving *up* is the other
 * way round, and it is {@link unlaidBy}: the bulldozer can take away the very
 * tile a flight climbs to, and that flight has to be re-asked — it climbs
 * somewhere else now, or it is flat again. A crossing pays for the same thing by
 * being re-asked from scratch on either side: which end of a span a tile is
 * *can* change back, so both re-lay every tile of a crossing beside an edit
 * rather than looking for a state to stop at.
 */

import {
  derivedKey,
  place,
  type LayoutItem,
  type Placement,
  type Tile,
} from '../../layout/domain/resortLayout';
import { PAVING_IDS } from '../../layout/domain/resortPlan';
import type { LevelProvider } from '../../layout/domain/elevation';
import { climbAt, CLIMBS, type PavedProvider } from '../../layout/domain/stairs';
import { spanAt, type SpanProvider } from '../../layout/domain/spans';
import type { Rotation } from '../../layout/domain/rotation';
import type { TileOccupancy } from './tileOccupancy';

/** What paving stands on a tile as the plot is edited, or null for none. */
export interface PavedGround {
  (tileX: number, tileZ: number): LayoutItem | null;
}

/** Whether laying this object is a paving gesture at all. */
export function isPaving(item: LayoutItem): boolean {
  return PAVING_IDS.has(item.id);
}

/**
 * What paving stands on each tile, read off the live occupancy index.
 *
 * The index holds keys rather than placements, which is enough: a derived
 * placement's key is its type and its tile — see `derivedKey` — so the paving on
 * a tile is whichever paving type's key the index is holding there, and no key
 * has to be taken apart to find out. A cottage's tile matches none of them and
 * comes back unpaved, which is what the stair rule wants: a flight only ever
 * climbs towards paving.
 */
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

/** Everything the paving rule reads that does not change from tile to tile. */
export interface PavingRules {
  /** What paving already stands on a tile, if any. */
  readonly pavedWith: PavedGround;
  /** How high the ground under a tile stands, in levels. */
  readonly levelOf: LevelProvider;
  /** Whether the ground under a tile is sand rather than grass. */
  readonly isSand: (tileX: number, tileZ: number) => boolean;
  /** Whether the tile is open water, which only a span may be laid over. */
  readonly isWater: (tileX: number, tileZ: number) => boolean;
  /**
   * Whether a tile of water is the *sea* rather than a river or a lake.
   *
   * The one thing the two bodies of water do not agree about. A pier is walked
   * out from a shore and a bridge is carried across a channel, so which of the
   * two a tile gets is this question and nothing else — see `terrain.ts`, where
   * the sea is the ground no brush may change.
   */
  readonly isSea: (tileX: number, tileZ: number) => boolean;
  /** The decking a path becomes on sand, or null when the catalogue has none. */
  readonly decking: LayoutItem | null;
  /**
   * The jetty a path becomes over the sea, or null when the catalogue has none —
   * in which case the sea stays the one ground nothing can be laid on, which is
   * what it was before there was a pier to lay on it.
   */
  readonly pier: LayoutItem | null;
  /**
   * The bridge a path becomes over a river or a lake, or null when the catalogue
   * has none — in which case inland water refuses paving exactly as the sea did
   * before there was a pier.
   */
  readonly bridge: LayoutItem | null;
  /**
   * The end of a crossing — the tile that climbs off the bank up to the bridge's
   * deck — or null when the catalogue has none, in which case a crossing is all
   * deck and steps up out of the water at the shore.
   */
  readonly bridgeRamp: LayoutItem | null;
  /**
   * The flight a path becomes where it climbs, or null when the catalogue has
   * none — in which case a step is simply paved flat, exactly as `layoutResort`
   * treats a catalogue missing one kind of paving.
   */
  readonly stairs: LayoutItem | null;
  /**
   * The flat paving a flight goes back to on grass once there is nothing left
   * for it to climb, or null when the catalogue has none — in which case the
   * flight is left standing. Laying never needs it, because what is laid flat is
   * whatever was picked; only taking paving up has nothing picked to fall back on.
   */
  readonly flagstones: LayoutItem | null;
}

/** An object as it actually goes down: what it is, and the way it faces. */
export interface Paving {
  readonly item: LayoutItem;
  readonly rotation: Rotation;
}

/** Whether a tile has any paving on it, which is what a flight climbs towards. */
const pavedProvider =
  (rules: PavingRules): PavedProvider =>
  (tileX, tileZ) =>
    rules.pavedWith(tileX, tileZ) !== null;

/**
 * What laying `item` on a tile actually lays there.
 *
 * A flight where the tile climbs to paving one level up, turned to face it;
 * decking where the tile is sand; and what was picked everywhere else, which is
 * the flagstones. This sits in front of both the preview and the placement, so
 * the ghost under the pointer shows the flight or the decking before the click
 * rather than after it.
 *
 * The climb is asked first, which is the order `layoutResort` resolves the two in
 * as well. They do meet: `elevationFor` keeps the whole beach on one level, but a
 * terrace anchored right at the sand edge puts the *lower* tile of its step on
 * the landward-most row of sand, and there the flight is the right answer — you
 * climb off the beach rather than walking up decking laid flat against a step.
 *
 * Flat paving is laid **unturned**, whatever the `R` key was left at: a slab has
 * no front, so its turn is the ground's to give and only a flight's climb has
 * anything to say about it. Everything that is not paving keeps the turn it was
 * picked with.
 */
export function pavingAt(
  item: LayoutItem,
  tile: Tile,
  rotation: Rotation,
  rules: PavingRules,
): Paving {
  if (!isPaving(item)) return { item, rotation };
  // Water first, and it is the one answer no other rule can overrule: a span
  // climbs nothing — water is flush with whatever it is cut into, see
  // `terrain.ts` — and there is no such thing as wet sand you could lay decking
  // on out there. Which span it is, is the only thing the sea and a river
  // disagree about.
  if (rules.isWater(tile.x, tile.z)) {
    const span = spanOver(tile, rules);
    if (span === null) return { item, rotation: 0 };
    // A pier is laid unturned — one tile of decking is every tile of it — where
    // a bridge is raised and so has ends. Which this tile is, and which way it
    // runs, is `spans.ts`; it is asked here and by `layoutResort` both, or a
    // crossing drawn by hand would come ashore somewhere a generated one does
    // not.
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

/**
 * The span a tile of water takes: a pier out at sea, a bridge over a river.
 *
 * One place rather than two, because {@link pavingAt} and {@link standsOn} ask
 * the same question from the two sides — what goes down here, and what may —
 * and two copies of a two-line rule is how a bridge ends up standing on ground
 * that refuses it.
 */
function spanOver(tile: Tile, rules: PavingRules): LayoutItem | null {
  return rules.isSea(tile.x, tile.z) ? rules.pier : rules.bridge;
}

/**
 * Whether the ground under a tile is water a span stands *above*.
 *
 * Inland water with a bridge in the catalogue, which is the same pair of
 * questions {@link spanOver} asks — it is asked twice because the two answers
 * are different shapes, an item and a fact about the ground, and `spans.ts`
 * wants the fact — and so does `handrails.ts`, which rails a crossing with the
 * bridge's own parapets rather than the ordinary rail.
 */
export const raisedProvider =
  (rules: PavingRules): SpanProvider =>
  (tileX, tileZ) =>
    rules.bridge !== null && rules.isWater(tileX, tileZ) && !rules.isSea(tileX, tileZ);

/**
 * Whether the ground under a tile will take this object at all.
 *
 * Water is the only ground that refuses anything, and it refuses everything but
 * the span that crosses it — so a hotel in the bay is turned down here, and the
 * jetty that {@link pavingAt} just handed back for the very same tile is not.
 *
 * This is a rule rather than a reservation, and that is the change a pier makes.
 * Water used to be seeded into the occupancy index as ground held by nobody, so
 * the pointer refused it by the ordinary "something is already there" rule and
 * no second rule existed to keep in step. Once one thing *can* stand on water
 * that no longer says what it needs to say: what may go on a tile of water is a
 * fact about the object, and an index of tiles cannot hold a fact about objects.
 *
 * A river makes it a fact about the *pair*: the bay takes a pier and not a
 * bridge, and a river takes a bridge and not a pier, so the tile is asked which
 * body of water it is before the object is asked what it is.
 */
export function standsOn(item: LayoutItem, tile: Tile, rules: PavingRules): boolean {
  if (!rules.isWater(tile.x, tile.z)) return true;
  const span = spanOver(tile, rules);
  if (span === null) return false;
  // Either half of a crossing: {@link pavingAt} hands back the bridge's deck on
  // some tiles of one and its ramp on the others, and a tile of water has to
  // take whichever of the two it was just given.
  return item.id === span.id || (span.id === rules.bridge?.id && item.id === rules.bridgeRamp?.id);
}

/** A tile of paving that has to be laid again, and the paving it replaces. */
export interface Relaid {
  /** The flight to stand on the tile. */
  readonly placement: Placement;
  /** The slab already there, which has to come up first. */
  readonly lifted: Placement;
}

/**
 * The tiles already paved that paving `tile` has just turned into flights.
 *
 * Asked *after* the tile is laid, so the tile counts as paved: what makes a slab
 * next to it a flight is that there is now paving one level above it, and that
 * is only true once the new tile is standing.
 *
 * Asked after *every* placement, too, not only a paved one — nothing but paving
 * can give a slab something to climb to, so a cottage or a hedge simply re-lays
 * nothing, and the pointer needs no second branch to know that.
 *
 * The slab that comes up is rebuilt rather than looked up, which is exact: flat
 * paving — flagstones or decking — is laid unturned and stands on the level of
 * its own tile, here as in `layoutResort`, so there is nothing else it could have
 * been.
 */
export function relaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  // Nothing but paving changes either answer: a flight is a fact about what is
  // paved around a tile, and so is which end of a crossing a tile of water is.
  // So a cottage or a hedge re-lays nothing, and the caller needs no second
  // branch to know that.
  if (rules.pavedWith(tile.x, tile.z) === null) return [];
  return relayBeside(tile, rules, (beside, slab, isPaved, isRaised) =>
    isRaised(beside.x, beside.z)
      ? spanBeside(beside, rules, isPaved, isRaised)
      : flightBeside(beside, slab, rules, isPaved),
  );
}

/**
 * The tiles already paved that taking the paving off `tile` has just changed.
 *
 * The other half of {@link relaidBy}, for the bulldozer, and asked *after* the
 * tile is gone, so it counts as unpaved. Two things beside it can have changed
 * their answer and nothing else can: a flight that climbed to it, which now
 * climbs to another neighbour or is flat again, and a tile of a crossing it was
 * the bank of. A flat slab cannot — taking paving away never gives a tile
 * something to climb to.
 *
 * Both are re-asked from scratch and laid again whatever the answer, for the
 * reason {@link spanBeside} gives: which way a flight faces is not on the index,
 * so a flight still facing the right way cannot be told from one that is not,
 * and re-laying what was already right costs a placement nobody sees.
 *
 * Only worth asking when what came up was paving: a cottage going changes
 * neither answer, and would re-lay every flight beside it for nothing. The piece
 * that comes up is rebuilt unturned, which is enough — a lift finds what it takes
 * down by key.
 */
export function unlaidBy(tile: Tile, rules: PavingRules): Relaid[] {
  return relayBeside(tile, rules, (beside, standing, isPaved, isRaised) => {
    if (isRaised(beside.x, beside.z)) return spanBeside(beside, rules, isPaved, isRaised);
    if (standing.id !== rules.stairs?.id) return null;
    return flightOrFlat(beside, rules, isPaved);
  });
}

/** What a paved neighbour should be laid as, or null to leave it standing. */
interface RelayRule {
  (
    beside: Tile,
    standing: LayoutItem,
    isPaved: PavedProvider,
    isRaised: SpanProvider,
  ): Paving | null;
}

/**
 * Asks a rule of each paved tile beside `tile`, and pairs every answer with the
 * piece already standing there that has to come up first.
 */
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

/**
 * What a tile of a crossing beside the new paving should be standing as.
 *
 * Re-asked every time rather than left alone once it is standing, which is where
 * this differs from the flight below. Both halves of what `spans.ts` reads can
 * change under a span — a bank paved *after* the water it adjoins turns that
 * tile from the middle of the crossing into its end, and that is exactly what
 * paving the far side of a river does — and unlike a flight there is no "already
 * a flight" state to stop at, because the answer includes the way the tile is
 * turned. Re-laying what was already right costs a placement nobody sees.
 */
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

/**
 * The flight a slab beside the new paving has just become, or null for none.
 *
 * A tile that is already a flight is left alone: it climbs somewhere, and
 * re-facing it would only ever move the fudge an L-bend was resolved with.
 */
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

/**
 * What a flight should be once a tile beside it has been taken up: still a
 * flight, faced at whatever it climbs to now, or the flat paving its ground
 * takes — decking on sand, flagstones elsewhere, the same choice {@link pavingAt}
 * makes. Null, and the flight is left, when the catalogue has nothing flat.
 */
function flightOrFlat(tile: Tile, rules: PavingRules, isPaved: PavedProvider): Paving | null {
  const climb = climbAt(tile, isPaved, rules.levelOf);
  if (climb !== null) return { item: rules.stairs!, rotation: climb };
  const decking = rules.isSand(tile.x, tile.z) ? rules.decking : null;
  const flat = decking ?? rules.flagstones;
  return flat === null ? null : { item: flat, rotation: 0 };
}
