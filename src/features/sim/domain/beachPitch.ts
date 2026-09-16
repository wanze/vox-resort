/**
 * Where a party settles on the beach: one place near the gate they came out at,
 * with a spot for every member.
 *
 * Before this, a visit to the beach was spent walking about on it - a point a few
 * columns off, a dice roll, another point - and at the camera's distance that is
 * a crowd pacing a beach for no reason. A party on a beach puts its towels down
 * together and stays there, so a visit is now a stay at a **pitch**: a tile of
 * open sand, loungers beside it where there are free ones, and the sand itself
 * where there are not.
 *
 * ## Nearest first, loungers before sand
 *
 * The search is breadth-first over beach tiles from the gate, each step only
 * where the straight line between the two tile centres is clear, as
 * `sandRoute.ts` sweeps - so a pitch is somewhere a route can reach. Of the
 * tiles it reaches, the nearest is taken in this order: a free lounger for every
 * adult, then any free lounger at all, then open sand set back from the gate,
 * then open sand anywhere. See {@link Tier}.
 *
 * **A lounger counts from anywhere in the tile's own square of nine**, and the
 * walk up to it is not asked whether it is clear. The beach is laid in sets of
 * lounger, parasol, lounger with a clear column between sets, so a lounger's
 * four direct neighbours are a parasol and the next set's lounger as often as
 * not: counting only those, 2 of the reference plot's 27 gates could seat a
 * couple on loungers, and everybody else lay on the sand in front of the gate.
 * With the diagonals it is every gate. The last step onto a lounger is a step
 * into its own box, which is what a lounger is for.
 *
 * Pure and deterministic: the same beach, gate and loungers give the same pitch.
 * Nothing here walks anybody - the router routes each member to their spot.
 */

import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { GROUND_SIT_RISE, RESTING } from '../../crowd/domain/crowd';
import { blockedAt, clearLine } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { terrainAt, type Shore } from '../../layout/domain/shoreline';

/** Somewhere one member of a party rests. */
export interface PitchSpot {
  readonly x: number;
  readonly z: number;
  /** Where the hips are: on a lounger, or on the sand. */
  readonly y: number;
  /** Which way they face: the sea, which is +z, so 0 on the sand; a lounger's own heading. */
  readonly heading: number;
  /** A lounger in `network.seats` to lie on, or -1 for the sand. */
  readonly seat: number;
  /** `RESTING.lying` or `RESTING.sitting`. */
  readonly pose: number;
}

export interface Pitch {
  /** The middle of the pitch's tile: what every member is routed to before their spot. */
  readonly x: number;
  readonly z: number;
  /** The tile it claims, as `tileZ * tilesX + tileX`, for the next party's `taken`. */
  readonly tile: number;
  /** One spot per party member, in member order. */
  readonly spots: readonly PitchSpot[];
}

export interface PitchInput {
  readonly network: WalkNetwork;
  /** The gate the party comes onto the sand at. */
  readonly gate: number;
  /** How many spots are wanted, and which of them are children. Adults first. */
  readonly members: readonly { readonly child: boolean }[];
  /** Beach tiles other parties have already pitched on, as `tileZ * tilesX + tileX`. */
  readonly taken: ReadonlySet<number>;
  /** Whether a lounger is free right now, and not promised to another party. */
  readonly loungerFree: (seat: number) => boolean;
}

/** How far from its gate a party pitches, in tile steps: nobody carries towels half-way along the beach. */
const PITCH_TILES = 12;

/** Voxels between two members side by side on the sand, and between two rows of them. */
const SPOT_SPACING = 5;

/** Members side by side in a row before a second row is started behind it. */
const ROW_LENGTH = 3;

/**
 * Tile steps from the gate a party will not put their towels down inside, when
 * they are putting them on the sand rather than on loungers.
 *
 * The tile in front of a gate is where everybody coming onto the beach walks
 * through, and a party lying across it reads as a picnic in a doorway. It is a
 * preference and not a rule: a beach with nothing further out free still takes
 * them here rather than turning them away.
 */
const SAND_SET_BACK = 2;

/** Voxels at the gate end of the step off the paving that are not asked about obstacles. */
const GATE_CLEAR = TILE_VOXELS / 2 + 2;

/** The 4-neighbours, in `sandRoute.ts`'s order so the same beach sweeps the same way. */
const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/** A tile's own square of nine: where its loungers are looked for. */
const AROUND = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => [dx, dz] as const));

/**
 * How good a pitch is, best first: everybody who wants a lounger on one, then
 * somebody on one, then sand out of the way of the gate, then sand at all.
 */
const TIER = { loungers: 0, someLoungers: 1, sand: 2, atTheGate: 3 } as const;
type Tier = (typeof TIER)[keyof typeof TIER];

/** A tile the sweep reached. */
interface Tile {
  readonly tileX: number;
  readonly tileZ: number;
  readonly depth: number;
}

/**
 * Where a party coming onto the sand at `gate` settles, or null when nothing
 * within {@link PITCH_TILES} of it will take them.
 */
export function pitchFor(input: PitchInput): Pitch | null {
  const { network, gate, members } = input;
  const beach = network.beach;
  const node = network.nodes[gate];
  if (!beach || !node?.gate || members.length === 0) return null;

  const context = contextFor(input, beach.shore, beach.tilesX);
  const adults = members.filter((member) => !member.child).length;
  const best = new Map<Tier, Pitch>();
  for (const tile of sweepFrom(context, node)) {
    const pitch = pitchOn(context, tile, members);
    if (!pitch) continue;
    const tier = tierOf(pitch, tile, adults);
    if (tier === TIER.loungers) return pitch;
    if (!best.has(tier)) best.set(tier, pitch);
  }
  for (const tier of [TIER.someLoungers, TIER.sand, TIER.atTheGate] as const) {
    const pitch = best.get(tier);
    if (pitch) return pitch;
  }
  return null;
}

/** How good this pitch is; see {@link TIER}. */
function tierOf(pitch: Pitch, tile: Tile, adults: number): Tier {
  const onLoungers = pitch.spots.filter((spot) => spot.seat >= 0).length;
  if (onLoungers >= adults && adults > 0) return TIER.loungers;
  if (onLoungers > 0) return TIER.someLoungers;
  return tile.depth >= SAND_SET_BACK ? TIER.sand : TIER.atTheGate;
}

/** What one search reads over and over, worked out once. */
interface Context {
  readonly input: PitchInput;
  readonly shore: Shore;
  readonly tilesX: number;
  /** Tiles with paving on them: a boardwalk over the sand is walked along, not pitched on. */
  readonly paved: ReadonlySet<number>;
  /** Every lounger on the beach, by the key of the tile it stands on. */
  readonly loungers: ReadonlyMap<number, readonly number[]>;
}

function contextFor(input: PitchInput, shore: Shore, tilesX: number): Context {
  const { network } = input;
  const keyOf = (tileX: number, tileZ: number): number => tileZ * tilesX + tileX;
  const paved = new Set(network.nodes.map((each) => keyOf(each.tileX, each.tileZ)));
  const loungers = new Map<number, number[]>();
  for (const seat of network.beachSeats) {
    const spot = network.seats[seat]!;
    const key = keyOf(Math.floor(spot.x / TILE_VOXELS), Math.floor(spot.z / TILE_VOXELS));
    const here = loungers.get(key);
    if (here) here.push(seat);
    else loungers.set(key, [seat]);
  }
  return { input, shore, tilesX, paved, loungers };
}

const keyIn = (context: Context, tileX: number, tileZ: number): number =>
  tileZ * context.tilesX + tileX;

const centreOf = (tileX: number, tileZ: number): { x: number; z: number } => ({
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
});

/** Whether a point is on a beach tile of the plot. */
function onBeach(context: Context, x: number, z: number): boolean {
  const tileX = Math.floor(x / TILE_VOXELS);
  if (tileX < 0 || tileX >= context.tilesX) return false;
  return terrainAt(context.shore, tileX, Math.floor(z / TILE_VOXELS)) === 'beach';
}

/**
 * Every beach tile within {@link PITCH_TILES} of the gate that a straight step
 * from the tile before reaches, nearest first.
 */
function sweepFrom(
  context: Context,
  gate: { readonly x: number; readonly z: number; readonly tileX: number; readonly tileZ: number },
): Tile[] {
  const sand = context.input.network.sand;
  const reached: Tile[] = [];
  const seen = new Set<number>();
  const reach = (tileX: number, tileZ: number, from: { x: number; z: number }, depth: number) => {
    const key = keyIn(context, tileX, tileZ);
    const centre = centreOf(tileX, tileZ);
    if (seen.has(key) || !onBeach(context, centre.x, centre.z)) return;
    const skip = depth === 0 ? GATE_CLEAR : 0;
    if (sand && !clearLine(sand, from.x, from.z, centre.x, centre.z, skip)) return;
    seen.add(key);
    reached.push({ tileX, tileZ, depth });
  };
  for (const [dx, dz] of NEIGHBOURS) reach(gate.tileX + dx, gate.tileZ + dz, gate, 0);
  for (let head = 0; head < reached.length; head++) {
    const from = reached[head]!;
    if (from.depth >= PITCH_TILES) continue;
    for (const [dx, dz] of NEIGHBOURS) {
      reach(from.tileX + dx, from.tileZ + dz, centreOf(from.tileX, from.tileZ), from.depth + 1);
    }
  }
  return reached;
}

/**
 * The pitch one tile makes for the party, or null when it will not take them:
 * somebody else is on it, it is paving, or a spot on the sand is not clear.
 */
function pitchOn(context: Context, tile: Tile, members: PitchInput['members']): Pitch | null {
  const key = keyIn(context, tile.tileX, tile.tileZ);
  if (context.input.taken.has(key) || context.paved.has(key)) return null;
  const centre = centreOf(tile.tileX, tile.tileZ);
  const loungers = freeLoungersBeside(context, tile, centre);
  const adults = members.filter((member) => !member.child).length;
  const lying = Math.min(adults, loungers.length);

  const sandSpots = sandSpotsAt(context, centre, members.length - lying);
  if (!sandSpots) return null;
  const onLoungers = loungers.slice(0, lying).map((seat) => loungerSpot(context, seat));
  const onSand = members.slice(lying).map((member, index) => sandSpot(sandSpots[index]!, member));
  return { x: centre.x, z: centre.z, tile: key, spots: [...onLoungers, ...onSand] };
}

/**
 * Lying on a lounger, the way the lounger lies. The first adults take the
 * loungers there are, which is why members come adults first.
 */
function loungerSpot(context: Context, seat: number): PitchSpot {
  const spot = context.input.network.seats[seat]!;
  return { x: spot.x, z: spot.z, y: spot.y, heading: spot.heading, seat, pose: RESTING.lying };
}

/** On the sand facing the sea: an adult lying on it, a child sitting up. */
function sandSpot(
  point: { readonly x: number; readonly z: number },
  member: { readonly child: boolean },
): PitchSpot {
  return {
    x: point.x,
    z: point.z,
    y: member.child ? BEACH_SURFACE + GROUND_SIT_RISE : BEACH_SURFACE,
    heading: 0,
    seat: -1,
    pose: member.child ? RESTING.sitting : RESTING.lying,
  };
}

/**
 * The free loungers in a tile's own square of nine, nearest its middle first and
 * ties to the lower seat. See the note at the top of the file on why the walk up
 * to one is not asked about obstacles.
 */
function freeLoungersBeside(
  context: Context,
  tile: Tile,
  centre: { readonly x: number; readonly z: number },
): number[] {
  const { network, loungerFree } = context.input;
  const found: number[] = [];
  for (const [dx, dz] of AROUND) {
    for (const seat of context.loungers.get(keyIn(context, tile.tileX + dx, tile.tileZ + dz)) ??
      []) {
      if (loungerFree(seat)) found.push(seat);
    }
  }
  const distance = (seat: number): number =>
    Math.hypot(network.seats[seat]!.x - centre.x, network.seats[seat]!.z - centre.z);
  return found.toSorted((a, b) => distance(a) - distance(b) || a - b);
}

/**
 * `count` spots on the sand about a tile's middle: rows of {@link ROW_LENGTH}
 * across it, {@link SPOT_SPACING} apart, each row further from the sea than the
 * one before. Null when any of them is off the beach, inside something, or
 * cannot be walked to straight from the middle.
 */
function sandSpotsAt(
  context: Context,
  centre: { readonly x: number; readonly z: number },
  count: number,
): { x: number; z: number }[] | null {
  const sand = context.input.network.sand;
  const spots: { x: number; z: number }[] = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / ROW_LENGTH);
    const inRow = Math.min(ROW_LENGTH, count - row * ROW_LENGTH);
    const across = (index % ROW_LENGTH) - (inRow - 1) / 2;
    const x = centre.x + across * SPOT_SPACING;
    const z = centre.z - row * SPOT_SPACING;
    if (!onBeach(context, x, z)) return null;
    if (sand && (blockedAt(sand, x, z) || !clearLine(sand, centre.x, centre.z, x, z))) return null;
    spots.push({ x, z });
  }
  return spots;
}
