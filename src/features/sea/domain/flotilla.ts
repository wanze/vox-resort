import { WALK_SPEED } from '../../crowd/domain/crowd';
import { createRandom } from '../../layout/domain/random';
import { WALK_VOXELS_PER_SIM_HOUR } from '../../sim/domain/crowdRate';
import type { PierBox } from './piers';
import type { Mooring, Rental, SailingGround } from './swimArea';

// A backgrounded tab reports its whole absence as one frame; unclamped, every
// boat would cross the bay.
export const MAX_STEP = 0.1;

// 40 cm a second: faster reads as a motorboat, slower and the fleet stops looking alive.
const SPEED_VOXELS = 1.6;
const SPEED_SPREAD = 0.45;

// The turn itself swings, so a boat traces a slow S across the bay rather than a circle.
const TURN_RADIANS = 0.11;
const SWING_RATE = 0.09;

// Hire boats keep the crowd's seconds, not real ones: they carry guests, so they stop when the
// crowd does, and a hire is the same share of the resort day at every speed.
const CROWD_SECONDS_PER_HOUR = WALK_VOXELS_PER_SIM_HOUR / WALK_SPEED;
const HIRE_SECONDS = 2 * CROWD_SECONDS_PER_HOUR;
// A berth no route reaches would keep its boat out, and the hire it holds taken, for good.
const GIVE_UP_SECONDS = 3 * HIRE_SECONDS;

// Under a voxel a step at the fastest fleet's pace, so a boat coming home cannot step over its berth.
const STEP_VOXELS = 0.9;
const HIRE_STEP = 0.25;
// Bounds a long frame at rush the way the crowd's substeps do; the rest is dropped. A fleet whose
// steps are shorter is given more of them, so it covers as much of a long frame.
const MAX_HIRE_STEPS = 16;
const MOST_HIRE_STEPS = 64;

// Just short of launching, so a boat held for want of a hirer goes out the frame one turns up.
const HELD_AGE = -1e-3;

// Thirty tiles: out across the bay, yet home within the hour.
const HIRE_REACH = 480;

const TIED_SECONDS = 25;
const TIED_SPREAD = 45;

// A turning circle inside the berth's reach, or a quick boat circles its berth for ever.
const HELM_VOXELS = 3;

const BERTH_VOXELS = 4;

// The row has to fit the corridor cut through the swimming area (CORRIDOR_TILES in swimArea.ts).
const BERTH_SPACING = 12;

const BERTH_OUT = 4;

// From the tow post to the towed craft's nose: 3.5 m.
const ROPE = 14;
// Off its tug's, so the two never heave as one.
const TOW_RIDE = 2.4;

// A turning circle and a bit clear of an obstacle's corner, so a boat rounding it never clips it.
const DETOUR_VOXELS = 4;
// A boat shoved out of a pier sits exactly its reach away, and must still see along that side.
const WALL_SLACK = 0.5;
// Enough for a pier, an island past it and a pier past that between a boat and its berth.
const MAX_DETOURS = 3;

const LOOK_SECONDS = 6;
// Under a tile, the narrowest a pier is, so no probe steps over one.
const PROBE_VOXELS = 12;
const AVOID_RADIANS = 0.6;
// A probe inside a pier is its own threat, dead ahead to within rounding; without a band the
// rounding chose the side, and a boat facing a pier dithered against it.
const DEAD_AHEAD = 0.02;
// Held to under half its stride for this long, a boat is pinned rather than brushing past.
const BLOCKED_SHARE = 0.5;
const BLOCKED_SECONDS = 1;

const DEFAULT_RADIUS = 8;

// No rate is a multiple of another, so the swell never reads as a loop.
const HEAVE_VOXELS = 0.4;
const HEAVE_RATE = 1.1;
const ROLL_RADIANS = 0.06;
const ROLL_RATE = 0.83;
const PITCH_RADIANS = 0.045;
const PITCH_RATE = 1.37;

export interface FlotillaOptions {
  readonly moorings: readonly Mooring[];
  readonly buoyVariant: number;
  readonly craft: number;
  readonly craftVariants: readonly number[];
  readonly fleets?: readonly FleetOptions[];
  // Per fleet; left out, every hire boat may be out at once.
  readonly hireAllowed?: readonly number[];
  readonly ground: SailingGround;
  // Half the length, since a hull turns.
  readonly radii?: readonly number[];
  readonly piers?: readonly PierBox[];
  readonly islands?: readonly PierBox[];
  readonly waterline: number;
  readonly seed: number;
}

export interface FleetOptions {
  readonly rental: Rental;
  readonly variant: number;
  readonly count: number;
  // Voxels per crowd second.
  readonly pace: number;
  // The variant pulled behind each craft.
  readonly tows?: number | undefined;
}

export interface Flotilla {
  readonly count: number;
  readonly variant: Int32Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  // Radians from +z, the way every hull is drawn pointing.
  readonly heading: Float32Array;
  readonly speed: Float32Array;
  readonly turn: Float32Array;
  readonly swing: Float32Array;
  readonly ride: Float32Array;
  // Seconds it has been held back from going where it steered.
  readonly blocked: Float32Array;
  readonly hired: Uint8Array;
  // -1 for whatever is not hired out on its own: a buoy, a drifting craft, a towed one.
  readonly fleet: Int32Array;
  // The craft pulling it, -1 for the rest; a towed craft comes right after its tug.
  readonly towedBy: Int32Array;
  // Seconds into the hire, negative while tied up: one number for three states keeps
  // the per-frame loop to compares.
  readonly age: Float32Array;
  readonly berthX: Float32Array;
  readonly berthZ: Float32Array;
  readonly berthHeading: Float32Array;
  // Drawn once at build time so stepFlotilla stays free of the seeded generator.
  readonly gap: Float32Array;
  readonly radius: Float32Array;
  readonly piers: readonly PierBox[];
  readonly islands: readonly PierBox[];
  // Piers and islands merged wherever a hire boat could not pass between them, to route home round.
  readonly obstacles: readonly PierBox[];
  readonly waterline: number;
  // Per fleet, how many of its boats may be out at once; lowering it lets a boat finish its hire.
  readonly hireAllowed: Int32Array;
  readonly hireStep: number;
  readonly hireSteps: number;
  clock: number;
}

export interface AfloatPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly roll: number;
  readonly pitch: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const wrapAngle = (radians: number): number =>
  radians - Math.PI * 2 * Math.round(radians / (Math.PI * 2));

interface Berth {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

const distanceToBox = (box: PierBox, x: number, z: number): number =>
  Math.hypot(x - clamp(x, box.minX, box.maxX), z - clamp(z, box.minZ, box.maxZ));

// Slots under a pier give way to spares further along the row, nearest the hut first; a boat
// berthed in the decking could never get within reach of its berth to tie up.
function layBerths(
  fleet: FleetOptions,
  ground: SailingGround,
  obstacles: readonly PierBox[],
  reach: number,
): Berth[] {
  const { count, rental } = fleet;
  const slots: { x: number; blocked: boolean }[] = [];
  // A whole row spare past each end, so even a pier across the hut's front leaves a row clear.
  for (let slot = -count; slot < count * 2; slot++) {
    const x = rental.x + (slot - (count - 1) / 2) * BERTH_SPACING;
    const z = ground.landwardZ(x) + BERTH_OUT;
    const blocked = obstacles.some((box) => distanceToBox(box, x, z) < reach * 2 + DETOUR_VOXELS);
    slots.push({ x, blocked });
  }
  return slots
    .toSorted(
      (a, b) =>
        Number(a.blocked) - Number(b.blocked) ||
        Math.abs(a.x - rental.x) - Math.abs(b.x - rental.x),
    )
    .slice(0, count)
    .toSorted((a, b) => a.x - b.x)
    .map(({ x }) => {
      const z = ground.landwardZ(x) + BERTH_OUT;
      return { x, z, heading: Math.atan2(rental.x - x, rental.z - z) };
    });
}

// Boxes closer than a hull's width are one wall to a boat: routing between them would
// aim it at a gap it cannot pass.
function mergeObstacles(boxes: readonly PierBox[], width: number): PierBox[] {
  const merged = [...boxes];
  for (let one = 0; one < merged.length; one++) {
    for (let other = one + 1; other < merged.length; other++) {
      const a = merged[one]!;
      const b = merged[other]!;
      const apart =
        a.minX - width >= b.maxX ||
        b.minX - width >= a.maxX ||
        a.minZ - width >= b.maxZ ||
        b.minZ - width >= a.maxZ;
      if (apart) continue;
      merged[one] = {
        minX: Math.min(a.minX, b.minX),
        maxX: Math.max(a.maxX, b.maxX),
        minZ: Math.min(a.minZ, b.minZ),
        maxZ: Math.max(a.maxZ, b.maxZ),
      };
      merged.splice(other, 1);
      // The grown box may now reach one already passed over.
      other = one;
    }
  }
  return merged;
}

const reachOf = (options: FlotillaOptions, variant: number): number =>
  options.radii?.[variant] ?? DEFAULT_RADIUS;

// Merged for the widest hull out, as every homing boat routes round the same boxes; each fleet
// berths clear of them by its own.
function hireWaters(
  options: FlotillaOptions,
  fleets: readonly FleetOptions[],
  boxes: readonly PierBox[],
): { obstacles: PierBox[]; berths: Berth[][] } {
  const reaches = fleets.map((fleet) => reachOf(options, fleet.variant));
  const widest = reaches.length === 0 ? DEFAULT_RADIUS : Math.max(...reaches);
  const obstacles = mergeObstacles(boxes, widest * 2);
  const berths = fleets.map((fleet, at) =>
    layBerths(fleet, options.ground, obstacles, reaches[at]!),
  );
  return { obstacles, berths };
}

function hireStepFor(fleets: readonly FleetOptions[]): number {
  const fastest = Math.max(0, ...fleets.map((fleet) => fleet.pace));
  return fastest > 0 ? Math.min(HIRE_STEP, STEP_VOXELS / fastest) : HIRE_STEP;
}

// Buoys come first and in mooring order, so the field draws one instance per mooring.
export function createFlotilla(options: FlotillaOptions): Flotilla {
  const { moorings, ground, craftVariants } = options;
  const craft = craftVariants.length === 0 ? 0 : Math.max(0, options.craft);
  const fleets = options.fleets ?? [];
  const counts = fleets.map((fleet) => Math.max(0, fleet.count));
  const hired = fleets.reduce(
    (sum, fleet, at) => sum + counts[at]! * (fleet.tows === undefined ? 1 : 2),
    0,
  );
  const count = moorings.length + craft + hired;
  const random = createRandom(options.seed);
  const piers = options.piers ?? [];
  const islands = options.islands ?? [];
  const { obstacles, berths } = hireWaters(options, fleets, [...piers, ...islands]);
  const hireStep = hireStepFor(fleets);

  const flotilla: Flotilla = {
    count,
    variant: new Int32Array(count),
    x: new Float32Array(count),
    z: new Float32Array(count),
    heading: new Float32Array(count),
    speed: new Float32Array(count),
    turn: new Float32Array(count),
    swing: new Float32Array(count),
    ride: new Float32Array(count),
    blocked: new Float32Array(count),
    hired: new Uint8Array(count),
    fleet: new Int32Array(count).fill(-1),
    towedBy: new Int32Array(count).fill(-1),
    age: new Float32Array(count),
    berthX: new Float32Array(count),
    berthZ: new Float32Array(count),
    berthHeading: new Float32Array(count),
    gap: new Float32Array(count),
    radius: new Float32Array(count),
    piers,
    islands,
    obstacles,
    waterline: options.waterline,
    hireAllowed: Int32Array.from(counts, (boats, at) => options.hireAllowed?.[at] ?? boats),
    hireStep,
    hireSteps: Math.min(MOST_HIRE_STEPS, Math.ceil((MAX_HIRE_STEPS * HIRE_STEP) / hireStep)),
    clock: 0,
  };

  const helm = (index: number): void => {
    flotilla.speed[index] = SPEED_VOXELS * (1 + (random() * 2 - 1) * SPEED_SPREAD);
    flotilla.turn[index] = TURN_RADIANS * (random() * 2 - 1);
    flotilla.swing[index] = random() * Math.PI * 2;
    flotilla.ride[index] = random() * Math.PI * 2;
  };

  for (const [index, mooring] of moorings.entries()) {
    flotilla.variant[index] = options.buoyVariant;
    flotilla.x[index] = mooring.x;
    flotilla.z[index] = mooring.z;
    flotilla.heading[index] = wrapAngle(random() * Math.PI * 2);
    flotilla.ride[index] = random() * Math.PI * 2;
  }

  for (let boat = 0; boat < craft; boat++) {
    const index = moorings.length + boat;
    flotilla.variant[index] = craftVariants[Math.floor(random() * craftVariants.length)]!;
    flotilla.x[index] = ground.westX + random() * (ground.eastX - ground.westX);
    const landward = ground.landwardZ(flotilla.x[index]!);
    flotilla.z[index] = landward + random() * Math.max(0, ground.seawardZ - landward);
    flotilla.heading[index] = wrapAngle(random() * Math.PI * 2);
    helm(index);
    launchClear(flotilla, index);
  }

  const deal: Dealer = { random, helm, ground };
  let next = moorings.length + craft;
  for (const [at, fleet] of fleets.entries()) {
    for (const berth of berths[at]!) {
      flotilla.fleet[next] = at;
      dealHire(flotilla, next++, fleet, berth, deal);
      if (fleet.tows !== undefined) tether(flotilla, next++, fleet.tows);
    }
  }

  for (let index = 0; index < count; index++) {
    flotilla.radius[index] = reachOf(options, flotilla.variant[index]!);
  }

  // Only once every draw is dealt, so an allowance never moves the seeded ones.
  holdBeyondAllowance(flotilla, count - hired);
  settleTows(flotilla, ground);
  return flotilla;
}

interface Dealer {
  readonly random: () => number;
  readonly helm: (index: number) => void;
  readonly ground: SailingGround;
}

function dealHire(
  flotilla: Flotilla,
  index: number,
  fleet: FleetOptions,
  berth: Berth,
  { random, helm, ground }: Dealer,
): void {
  flotilla.variant[index] = fleet.variant;
  flotilla.hired[index] = 1;
  flotilla.berthX[index] = berth.x;
  flotilla.berthZ[index] = berth.z;
  flotilla.berthHeading[index] = berth.heading;
  flotilla.gap[index] = TIED_SECONDS + random() * TIED_SPREAD;
  helm(index);
  flotilla.speed[index]! *= fleet.pace / SPEED_VOXELS;
  // Dropped anywhere in the cycle, so the berths fill and empty from the first minute.
  const age = random() * (HIRE_SECONDS + flotilla.gap[index]!) - flotilla.gap[index]!;
  flotilla.age[index] = age;
  if (age < 0) {
    tieUp(flotilla, index, age);
    return;
  }
  const bearing = random() * Math.PI * 2;
  const off = random() * HIRE_REACH;
  const x = clamp(berth.x + Math.sin(bearing) * off, ground.westX, ground.eastX);
  const landward = ground.landwardZ(x);
  flotilla.x[index] = x;
  flotilla.z[index] = clamp(berth.z + Math.cos(bearing) * off, landward, ground.seawardZ);
  flotilla.heading[index] = wrapAngle(random() * Math.PI * 2);
  launchClear(flotilla, index);
}

function settleTows(flotilla: Flotilla, ground: SailingGround): void {
  for (let index = 0; index < flotilla.count; index++) {
    if (flotilla.towedBy[index]! < 0) continue;
    berthAstern(flotilla, index);
    towAlong(flotilla, index, ground);
  }
}

// Draws nothing, so a fleet with a tow leaves the seeded stream as one without would.
function tether(flotilla: Flotilla, index: number, variant: number): void {
  const tug = index - 1;
  flotilla.variant[index] = variant;
  flotilla.hired[index] = 1;
  flotilla.towedBy[index] = tug;
  flotilla.ride[index] = flotilla.ride[tug]! + TOW_RIDE;
  flotilla.heading[index] = flotilla.heading[tug]!;
  // Just behind the tug, wherever it is; the first towAlong pays out the rope.
  flotilla.x[index] = flotilla.x[tug]! - Math.sin(flotilla.heading[tug]!);
  flotilla.z[index] = flotilla.z[tug]! - Math.cos(flotilla.heading[tug]!);
}

// On the rope, out to sea of the tug's berth, so it is already in line when the tug sets off.
function berthAstern(flotilla: Flotilla, index: number): void {
  const tug = flotilla.towedBy[index]!;
  const heading = flotilla.berthHeading[tug]!;
  const astern = flotilla.radius[tug]! + ROPE + flotilla.radius[index]!;
  flotilla.berthX[index] = flotilla.berthX[tug]! - Math.sin(heading) * astern;
  flotilla.berthZ[index] = flotilla.berthZ[tug]! - Math.cos(heading) * astern;
  flotilla.berthHeading[index] = heading;
}

function holdBeyondAllowance(flotilla: Flotilla, firstHire: number): void {
  const out = new Int32Array(flotilla.hireAllowed.length);
  for (let index = firstHire; index < flotilla.count; index++) {
    const fleet = flotilla.fleet[index]!;
    if (fleet < 0 || flotilla.age[index]! < 0) continue;
    if (out[fleet]! < flotilla.hireAllowed[fleet]!) out[fleet]!++;
    else tieUp(flotilla, index, HELD_AGE);
  }
}

// Before radii are dealt, so it clears the hull by the default reach; the first step settles the rest.
function launchClear(flotilla: Flotilla, index: number): void {
  shovedX = flotilla.x[index]!;
  shovedZ = flotilla.z[index]!;
  for (const island of flotilla.islands) outOfIsland(island, DEFAULT_RADIUS);
  flotilla.x[index] = shovedX;
  flotilla.z[index] = shovedZ;
}

function tieUp(flotilla: Flotilla, index: number, age: number): void {
  flotilla.age[index] = age;
  flotilla.x[index] = flotilla.berthX[index]!;
  flotilla.z[index] = flotilla.berthZ[index]!;
  flotilla.heading[index] = flotilla.berthHeading[index]!;
}

// A trailer on a hitch: pulled straight towards the tug's stern, so it cuts inside the tug's turn
// as a towed float does.
function towAlong(flotilla: Flotilla, index: number, ground: SailingGround): void {
  const tug = flotilla.towedBy[index]!;
  if (flotilla.age[tug]! < 0) {
    tieUp(flotilla, index, flotilla.age[tug]!);
    return;
  }
  flotilla.age[index] = flotilla.age[tug]!;
  const heading = flotilla.heading[tug]!;
  const behind = flotilla.radius[tug]!;
  const reach = ROPE + flotilla.radius[index]!;
  const hitchX = flotilla.x[tug]! - Math.sin(heading) * behind;
  const hitchZ = flotilla.z[tug]! - Math.cos(heading) * behind;
  const rx = flotilla.x[index]! - hitchX;
  const rz = flotilla.z[index]! - hitchZ;
  const apart = Math.hypot(rx, rz);
  const x = apart === 0 ? hitchX - Math.sin(heading) * reach : hitchX + (rx / apart) * reach;
  const z = apart === 0 ? hitchZ - Math.cos(heading) * reach : hitchZ + (rz / apart) * reach;
  // Kept off the sand and out of the decking, at the cost of a slack rope for a moment.
  shovedX = clamp(x, ground.westX, ground.eastX);
  shovedZ = clamp(z, ground.landwardZ(shovedX), ground.seawardZ);
  for (const pier of flotilla.piers) outOfPier(pier, flotilla.radius[index]!);
  for (const island of flotilla.islands) outOfIsland(island, flotilla.radius[index]!);
  flotilla.x[index] = shovedX;
  flotilla.z[index] = shovedZ;
  flotilla.heading[index] = Math.atan2(hitchX - shovedX, hitchZ - shovedZ);
}

// `hireDt` is the crowd's time this frame; left out, the hire boats keep real time with the rest.
export function stepFlotilla(
  flotilla: Flotilla,
  dt: number,
  ground: SailingGround,
  hireDt = dt,
): void {
  flotilla.clock += dt;
  for (let index = 0; index < flotilla.count; index++) {
    if (flotilla.speed[index] !== 0 && flotilla.hired[index] === 0) {
      drift(flotilla, index, dt, ground);
    }
  }
  if (!(hireDt > 0)) return;
  const steps = Math.min(flotilla.hireSteps, Math.ceil(hireDt / flotilla.hireStep));
  const step = Math.min(flotilla.hireStep, hireDt / steps);
  for (let at = 0; at < steps; at++) {
    for (let index = 0; index < flotilla.count; index++) {
      if (flotilla.hired[index] === 0 || flotilla.towedBy[index]! >= 0) continue;
      stepHire(flotilla, index, step, ground);
      if (flotilla.towedBy[index + 1] === index) towAlong(flotilla, index + 1, ground);
    }
  }
}

function stepHire(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  const tied = flotilla.age[index]! < 0;
  const age = flotilla.age[index]! + dt;
  const fleet = flotilla.fleet[index]!;
  if (tied && age >= 0 && hiresOut(flotilla, fleet) >= flotilla.hireAllowed[fleet]!) {
    flotilla.age[index] = HELD_AGE;
    return;
  }
  flotilla.age[index] = age;
  if (age < 0) return;

  const away = Math.hypot(
    flotilla.berthX[index]! - flotilla.x[index]!,
    flotilla.berthZ[index]! - flotilla.z[index]!,
  );
  if (age >= HIRE_SECONDS) {
    if (away <= BERTH_VOXELS || age >= GIVE_UP_SECONDS)
      tieUp(flotilla, index, -flotilla.gap[index]!);
    else steerHome(flotilla, index, dt, ground);
    return;
  }
  if (away > HIRE_REACH) steerHome(flotilla, index, dt, ground);
  else drift(flotilla, index, dt, ground);
}

// Counted afresh rather than kept, so it cannot drift from the ages; only a boat due out asks.
function hiresOut(flotilla: Flotilla, fleet: number): number {
  let out = 0;
  for (let index = 0; index < flotilla.count; index++) {
    if (flotilla.fleet[index] === fleet && flotilla.age[index]! >= 0) out++;
  }
  return out;
}

// Turned back by mirroring the heading about the limit it met: steering towards the
// middle can leave a boat grinding along an edge.
function drift(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  const swinging = Math.sin(flotilla.clock * SWING_RATE + flotilla.swing[index]!);
  const heading = wrapAngle(flotilla.heading[index]! + flotilla.turn[index]! * swinging * dt);
  hold(flotilla, index, heading, dt, ground);
}

function steerHome(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  routeHome(flotilla, index, ground);
  const bearing = Math.atan2(routeX - flotilla.x[index]!, routeZ - flotilla.z[index]!);
  const off = wrapAngle(bearing - flotilla.heading[index]!);
  const helm = (flotilla.speed[index]! / HELM_VOXELS) * dt;
  const over = Math.sign(off) * Math.min(Math.abs(off), helm);
  hold(flotilla, index, wrapAngle(flotilla.heading[index]! + over), dt, ground);
}

// Module-level so a homing step allocates nothing; only meaningful straight after routeHome.
let routeX = 0;
let routeZ = 0;

// Steering straight for the berth pins a boat to any pier in the way: the helm turns it back
// faster than avoid turns it off. So it makes for a corner of the first thing in the way instead.
function routeHome(flotilla: Flotilla, index: number, ground: SailingGround): void {
  const x = flotilla.x[index]!;
  const z = flotilla.z[index]!;
  const wall = flotilla.radius[index]! - WALL_SLACK;
  const clear = flotilla.radius[index]! + DETOUR_VOXELS;
  routeX = flotilla.berthX[index]!;
  routeZ = flotilla.berthZ[index]!;
  for (let detour = 0; detour < MAX_DETOURS; detour++) {
    const box = firstInWay(flotilla.obstacles, wall, x, z);
    if (!box || !roundBox(box, wall, clear, x, z, ground)) return;
  }
}

// One the boat is inside is passed over: it is being shoved out of it, and is better steered home.
function firstInWay(
  obstacles: readonly PierBox[],
  wall: number,
  x: number,
  z: number,
): PierBox | null {
  let first: PierBox | null = null;
  let firstAt = Infinity;
  for (const box of obstacles) {
    const inside =
      x > box.minX - wall && x < box.maxX + wall && z > box.minZ - wall && z < box.maxZ + wall;
    if (inside) continue;
    const at = entryAlong(box, wall, x, z, routeX, routeZ);
    if (at < firstAt) {
      first = box;
      firstAt = at;
    }
  }
  return first;
}

let enter = 0;
let leave = 1;

// Open at the faces, so a boat slid along a side at its reach still sees along it.
function clip(from: number, delta: number, low: number, high: number): void {
  if (delta === 0) {
    if (from <= low || from >= high) leave = -1;
    return;
  }
  const one = (low - from) / delta;
  const two = (high - from) / delta;
  enter = Math.max(enter, Math.min(one, two));
  leave = Math.min(leave, Math.max(one, two));
}

function entryAlong(
  box: PierBox,
  wall: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): number {
  enter = 0;
  leave = 1;
  clip(fromX, toX - fromX, box.minX - wall, box.maxX + wall);
  clip(fromZ, toZ - fromZ, box.minZ - wall, box.maxZ + wall);
  return enter < leave ? enter : Infinity;
}

// The box's four corners and the route's end, searched shortest first. A corner off the
// sailing ground is dropped, so a pier is only ever rounded by its seaward end.
const nodeX = new Float64Array(5);
const nodeZ = new Float64Array(5);
const usable = new Uint8Array(5);
const cost = new Float64Array(5);
const firstHop = new Int8Array(5);
const settled = new Uint8Array(5);
const END = 4;

function roundBox(
  box: PierBox,
  wall: number,
  clear: number,
  x: number,
  z: number,
  ground: SailingGround,
): boolean {
  placeNodes(box, clear, ground);
  for (let node = 0; node <= END; node++) {
    const open = usable[node] === 1 && sees(box, wall, x, z, node);
    cost[node] = open ? Math.hypot(nodeX[node]! - x, nodeZ[node]! - z) : Infinity;
    firstHop[node] = node;
    settled[node] = 0;
  }
  for (let next = cheapestUnsettled(); next >= 0 && next !== END; next = cheapestUnsettled()) {
    settled[next] = 1;
    relaxFrom(box, wall, next);
  }
  if (cost[END] === Infinity) return false;
  routeX = nodeX[firstHop[END]!]!;
  routeZ = nodeZ[firstHop[END]!]!;
  return true;
}

function placeNodes(box: PierBox, clear: number, ground: SailingGround): void {
  nodeX[0] = nodeX[3] = box.minX - clear;
  nodeX[1] = nodeX[2] = box.maxX + clear;
  nodeZ[0] = nodeZ[1] = box.minZ - clear;
  nodeZ[2] = nodeZ[3] = box.maxZ + clear;
  nodeX[END] = routeX;
  nodeZ[END] = routeZ;
  for (let node = 0; node < END; node++) {
    const x = nodeX[node]!;
    const z = nodeZ[node]!;
    const afloat = x >= ground.westX && x <= ground.eastX && z <= ground.seawardZ;
    usable[node] = Number(afloat && z >= ground.landwardZ(x));
  }
  usable[END] = 1;
}

const sees = (box: PierBox, wall: number, x: number, z: number, node: number): boolean =>
  entryAlong(box, wall, x, z, nodeX[node]!, nodeZ[node]!) === Infinity;

function cheapestUnsettled(): number {
  let cheapest = -1;
  for (let node = 0; node <= END; node++) {
    if (settled[node] === 1 || cost[node] === Infinity) continue;
    if (cheapest < 0 || cost[node]! < cost[cheapest]!) cheapest = node;
  }
  return cheapest;
}

function relaxFrom(box: PierBox, wall: number, from: number): void {
  const x = nodeX[from]!;
  const z = nodeZ[from]!;
  for (let node = 0; node <= END; node++) {
    if (settled[node] === 1 || usable[node] === 0 || !sees(box, wall, x, z, node)) continue;
    const through = cost[from]! + Math.hypot(nodeX[node]! - x, nodeZ[node]! - z);
    if (through < cost[node]!) {
      cost[node] = through;
      firstHop[node] = firstHop[from]!;
    }
  }
}

// Order matters: avoid what is ahead, then shove out of overlaps so no hull shows
// through a pier or another hull, then the ground limits, which must never be left.
function hold(
  flotilla: Flotilla,
  index: number,
  steered: number,
  dt: number,
  ground: SailingGround,
): void {
  const speed = flotilla.speed[index]!;
  let heading = avoid(flotilla, index, steered, dt);
  shoveClear(
    flotilla,
    index,
    flotilla.x[index]! + Math.sin(heading) * speed * dt,
    flotilla.z[index]! + Math.cos(heading) * speed * dt,
  );
  let x = shovedX;
  let z = shovedZ;

  // Negating the heading mirrors x and keeps z; twice a limit's own bearing less the heading
  // mirrors about that limit.
  if (x < ground.westX || x > ground.eastX) {
    x = Math.min(ground.eastX, Math.max(ground.westX, x));
    heading = -heading;
  }
  const landward = ground.landwardZ(x);
  if (z < landward || z > ground.seawardZ) {
    const limit = z > ground.seawardZ ? Math.PI / 2 : shoreBearing(ground, x);
    z = Math.min(ground.seawardZ, Math.max(landward, z));
    heading = wrapAngle(2 * limit - heading);
  }

  const stride = speed * dt;
  const moved = Math.hypot(x - flotilla.x[index]!, z - flotilla.z[index]!);
  flotilla.blocked[index] = moved < stride * BLOCKED_SHARE ? flotilla.blocked[index]! + dt : 0;
  flotilla.heading[index] = heading;
  flotilla.x[index] = x;
  flotilla.z[index] = z;
}

// Along the curve, not across the plot: mirrored as if the shore were straight, a boat sliding
// along a rising stretch was turned back into it every step.
const shoreBearing = (ground: SailingGround, x: number): number =>
  Math.atan2(2, ground.landwardZ(x + 1) - ground.landwardZ(x - 1));

function letThrough(flotilla: Flotilla, one: number, other: number): boolean {
  if (flotilla.hired[one] === 0 || flotilla.hired[other] === 0) return false;
  return roped(flotilla, one, other) || berthedTogether(flotilla, one, other);
}

// On one rope: the tug's swing would otherwise shove it off its own tow.
const roped = (flotilla: Flotilla, one: number, other: number): boolean =>
  flotilla.towedBy[one] === other || flotilla.towedBy[other] === one;

// Berths are closer than two boats' reach, so holding hire boats apart would
// keep them off their berths.
function berthedTogether(flotilla: Flotilla, one: number, other: number): boolean {
  const oneIn = nearBerth(flotilla, one);
  const otherIn = nearBerth(flotilla, other);
  // A homing boat is let through the row, or the boats already tied up would turn it into circles.
  return (
    (oneIn && otherIn) || (homing(flotilla, one) && otherIn) || (homing(flotilla, other) && oneIn)
  );
}

const homing = (flotilla: Flotilla, index: number): boolean => flotilla.age[index]! >= HIRE_SECONDS;

const BERTH_APPROACH = BERTH_SPACING * 3;

function nearBerth(flotilla: Flotilla, index: number): boolean {
  return (
    Math.hypot(
      flotilla.x[index]! - flotilla.berthX[index]!,
      flotilla.z[index]! - flotilla.berthZ[index]!,
    ) < BERTH_APPROACH
  );
}

const fixed = (flotilla: Flotilla, index: number): boolean =>
  flotilla.speed[index] === 0 || (flotilla.hired[index] === 1 && flotilla.age[index]! < 0);

// Dead ahead turns to starboard, the same for both boats meeting head on, so they part.
// A plain loop: a few dozen craft cost less than a spatial index would.
function avoid(flotilla: Flotilla, index: number, heading: number, dt: number): number {
  const aheadX = Math.sin(heading);
  const aheadZ = Math.cos(heading);
  nearest = Infinity;
  piersAhead(flotilla, index, aheadX, aheadZ);
  craftAhead(flotilla, index, aheadX, aheadZ);
  if (nearest === Infinity) return heading;

  const bearing = Math.atan2(threatX - flotilla.x[index]!, threatZ - flotilla.z[index]!);
  const off = wrapAngle(bearing - heading);
  return wrapAngle(heading + dodgeSide(flotilla, index, off, heading) * AVOID_RADIANS * dt);
}

// Towards the sea, which is +z on every plot, for a pier dead ahead and for a boat held where it
// is: wedged between a pier, the shore and another boat, dodging each in turn undid every dodge.
function dodgeSide(flotilla: Flotilla, index: number, off: number, heading: number): number {
  const pinned = flotilla.blocked[index]! > BLOCKED_SECONDS;
  if (pinned || (threatIsBox && Math.abs(off) <= DEAD_AHEAD)) return Math.sin(heading) > 0 ? -1 : 1;
  return off > 0 ? -1 : 1;
}

// Module-level so a frame allocates nothing; only meaningful inside one call of avoid.
let nearest = Infinity;
let threatX = 0;
let threatZ = 0;
let threatIsBox = false;

const lookOf = (flotilla: Flotilla, index: number): number =>
  flotilla.radius[index]! + flotilla.speed[index]! * LOOK_SECONDS;

// Probed every PROBE_VOXELS along the look, the first within reach of the bow: probing only half
// way and at the end let a fast boat's look reach past a pier it was already pressed against.
function piersAhead(flotilla: Flotilla, index: number, aheadX: number, aheadZ: number): void {
  const look = lookOf(flotilla, index);
  const probes = Math.max(2, Math.ceil(look / PROBE_VOXELS));
  for (const pier of flotilla.piers) boxAhead(flotilla, index, pier, aheadX, aheadZ, look, probes);
  for (const island of flotilla.islands) {
    boxAhead(flotilla, index, island, aheadX, aheadZ, look, probes);
  }
}

function boxAhead(
  flotilla: Flotilla,
  index: number,
  box: PierBox,
  aheadX: number,
  aheadZ: number,
  look: number,
  probes: number,
): void {
  for (let probe = 1; probe <= probes; probe++) {
    const along = (look * probe) / probes;
    const px = flotilla.x[index]! + aheadX * along;
    const pz = flotilla.z[index]! + aheadZ * along;
    const cx = clamp(px, box.minX, box.maxX);
    const cz = clamp(pz, box.minZ, box.maxZ);
    if (along >= nearest || Math.hypot(px - cx, pz - cz) > flotilla.radius[index]!) continue;
    nearest = along;
    threatX = cx;
    threatZ = cz;
    threatIsBox = true;
  }
}

// Only past the bow: one lying alongside is shoved off, and dodging it as well set boats packed
// against a pier dodging each other in turn, on the spot.
function craftAhead(flotilla: Flotilla, index: number, aheadX: number, aheadZ: number): void {
  const look = lookOf(flotilla, index);
  for (let other = 0; other < flotilla.count; other++) {
    if (other === index || letThrough(flotilla, index, other)) continue;
    const rx = flotilla.x[other]! - flotilla.x[index]!;
    const rz = flotilla.z[other]! - flotilla.z[index]!;
    const along = rx * aheadX + rz * aheadZ;
    const at = Math.min(along, look);
    const off = Math.hypot(rx - aheadX * at, rz - aheadZ * at);
    const beside = along <= flotilla.radius[index]!;
    if (beside || along >= nearest || off > flotilla.radius[index]! + flotilla.radius[other]!) {
      continue;
    }
    nearest = along;
    threatX = flotilla.x[other]!;
    threatZ = flotilla.z[other]!;
    threatIsBox = false;
  }
}

let shovedX = 0;
let shovedZ = 0;

// Piers last, so being shouldered by another boat never leaves one in the decking. Each
// craft takes its own half of an overlap, so only the craft being stepped is written.
function shoveClear(flotilla: Flotilla, index: number, x: number, z: number): void {
  shovedX = x;
  shovedZ = z;
  const reach = flotilla.radius[index]!;
  for (let other = 0; other < flotilla.count; other++) {
    if (other === index || letThrough(flotilla, index, other)) continue;
    const rx = shovedX - flotilla.x[other]!;
    const rz = shovedZ - flotilla.z[other]!;
    const apart = Math.hypot(rx, rz);
    const overlap = reach + flotilla.radius[other]! - apart;
    if (overlap <= 0 || apart === 0) continue;
    const share = fixed(flotilla, other) ? overlap : overlap / 2;
    shovedX += (rx / apart) * share;
    shovedZ += (rz / apart) * share;
  }
  for (const pier of flotilla.piers) outOfPier(pier, reach);
  for (const island of flotilla.islands) outOfIsland(island, reach);
}

// Never out of the shoreward end: the landward limit would push it straight back in.
function outOfPier(pier: PierBox, reach: number): void {
  const west = shovedX - (pier.minX - reach);
  const east = pier.maxX + reach - shovedX;
  const south = pier.maxZ + reach - shovedZ;
  const inside = shovedZ > pier.minZ - reach && Math.min(west, east, south) > 0;
  if (!inside) return;
  const least = Math.min(west, east, south);
  if (least === west) shovedX -= west;
  else if (least === east) shovedX += east;
  else shovedZ += south;
}

// Any side, the shoreward one too: unlike a pier's, an island's has open water behind it.
function outOfIsland(island: PierBox, reach: number): void {
  const west = shovedX - (island.minX - reach);
  const east = island.maxX + reach - shovedX;
  const north = shovedZ - (island.minZ - reach);
  const south = island.maxZ + reach - shovedZ;
  const least = Math.min(west, east, north, south);
  if (least <= 0) return;
  if (least === west) shovedX -= west;
  else if (least === east) shovedX += east;
  else if (least === north) shovedZ -= north;
  else shovedZ += south;
}

export function poseOf(flotilla: Flotilla, index: number): AfloatPose {
  const ride = flotilla.ride[index]!;
  const clock = flotilla.clock;
  return {
    x: flotilla.x[index]!,
    y: flotilla.waterline + Math.sin(clock * HEAVE_RATE + ride) * HEAVE_VOXELS,
    z: flotilla.z[index]!,
    heading: flotilla.heading[index]!,
    roll: Math.sin(clock * ROLL_RATE + ride) * ROLL_RADIANS,
    pitch: Math.sin(clock * PITCH_RATE + ride) * PITCH_RADIANS,
  };
}
