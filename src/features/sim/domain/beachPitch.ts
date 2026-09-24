import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { GROUND_SIT_RISE, RESTING } from '../../crowd/domain/crowd';
import { blockedAt, clearLine } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { terrainAt, type Shore } from '../../layout/domain/shoreline';

export interface PitchSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly heading: number;
  readonly seat: number;
  readonly pose: number;
}

export interface Pitch {
  readonly x: number;
  readonly z: number;
  readonly tile: number;
  readonly spots: readonly PitchSpot[];
}

export interface PitchInput {
  readonly network: WalkNetwork;
  readonly gate: number;
  // Adults first: the first members take the loungers there are.
  readonly members: readonly { readonly child: boolean }[];
  readonly taken: ReadonlySet<number>;
  readonly loungerFree: (seat: number) => boolean;
}

const PITCH_TILES = 12;

const SPOT_SPACING = 5;

const ROW_LENGTH = 3;

// Everybody coming onto the beach walks through the tile in front of the gate.
// A preference, not a rule: a full beach still pitches there.
const SAND_SET_BACK = 2;

const GATE_CLEAR = TILE_VOXELS / 2 + 2;

// In `sandRoute.ts`'s order, so the same beach sweeps the same way.
const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

// The whole square of nine, not the four neighbours: the beach is laid lounger,
// parasol, lounger, so direct neighbours alone seat almost nobody.
const AROUND = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => [dx, dz] as const));

const TIER = { loungers: 0, someLoungers: 1, sand: 2, atTheGate: 3 } as const;
type Tier = (typeof TIER)[keyof typeof TIER];

interface Tile {
  readonly tileX: number;
  readonly tileZ: number;
  readonly depth: number;
}

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

function tierOf(pitch: Pitch, tile: Tile, adults: number): Tier {
  const onLoungers = pitch.spots.filter((spot) => spot.seat >= 0).length;
  if (onLoungers >= adults && adults > 0) return TIER.loungers;
  if (onLoungers > 0) return TIER.someLoungers;
  return tile.depth >= SAND_SET_BACK ? TIER.sand : TIER.atTheGate;
}

interface Context {
  readonly input: PitchInput;
  readonly shore: Shore;
  readonly tilesX: number;
  readonly paved: ReadonlySet<number>;
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

function onBeach(context: Context, x: number, z: number): boolean {
  const tileX = Math.floor(x / TILE_VOXELS);
  if (tileX < 0 || tileX >= context.tilesX) return false;
  return terrainAt(context.shore, tileX, Math.floor(z / TILE_VOXELS)) === 'beach';
}

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

function loungerSpot(context: Context, seat: number): PitchSpot {
  const spot = context.input.network.seats[seat]!;
  return { x: spot.x, z: spot.z, y: spot.y, heading: spot.heading, seat, pose: RESTING.lying };
}

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

// The walk up to a lounger is not checked for obstacles: the last step is into its own box.
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
