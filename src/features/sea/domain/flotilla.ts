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

const PEDAL_SHARE_OF_WALK = 0.6;

// Under a voxel a step at pedal pace, so a boat coming home cannot step over its berth.
const HIRE_STEP = 0.25;
// Bounds a long frame at rush the way the crowd's substeps do; the rest is dropped.
const MAX_HIRE_STEPS = 16;

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

const LOOK_SECONDS = 6;
const AVOID_RADIANS = 0.6;

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
  readonly hire?: HireOptions | null;
  // Left out, every hire boat may be out at once.
  readonly hireAllowed?: number;
  readonly ground: SailingGround;
  // Half the length, since a hull turns.
  readonly radii?: readonly number[];
  readonly piers?: readonly PierBox[];
  readonly islands?: readonly PierBox[];
  readonly waterline: number;
  readonly seed: number;
}

export interface HireOptions {
  readonly count: number;
  readonly variant: number;
  readonly rental: Rental;
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
  readonly hired: Uint8Array;
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
  readonly waterline: number;
  // How many hire boats may be out at once; lowering it lets a boat finish its hire.
  hireAllowed: number;
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

function berthFor(
  hire: HireOptions,
  ground: SailingGround,
  berth: number,
): { x: number; z: number; heading: number } {
  const x = hire.rental.x + (berth - (hire.count - 1) / 2) * BERTH_SPACING;
  const z = ground.landwardZ(x) + BERTH_OUT;
  return { x, z, heading: Math.atan2(hire.rental.x - x, hire.rental.z - z) };
}

// Buoys come first and in mooring order, so the field draws one instance per mooring.
export function createFlotilla(options: FlotillaOptions): Flotilla {
  const { moorings, ground, craftVariants } = options;
  const craft = craftVariants.length === 0 ? 0 : Math.max(0, options.craft);
  const hire = options.hire ?? null;
  const hired = hire ? Math.max(0, hire.count) : 0;
  const count = moorings.length + craft + hired;
  const random = createRandom(options.seed);

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
    hired: new Uint8Array(count),
    age: new Float32Array(count),
    berthX: new Float32Array(count),
    berthZ: new Float32Array(count),
    berthHeading: new Float32Array(count),
    gap: new Float32Array(count),
    radius: new Float32Array(count),
    piers: options.piers ?? [],
    islands: options.islands ?? [],
    waterline: options.waterline,
    hireAllowed: options.hireAllowed ?? hired,
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

  for (let boat = 0; boat < hired; boat++) {
    const index = moorings.length + craft + boat;
    const berth = berthFor(hire!, ground, boat);
    flotilla.variant[index] = hire!.variant;
    flotilla.hired[index] = 1;
    flotilla.berthX[index] = berth.x;
    flotilla.berthZ[index] = berth.z;
    flotilla.berthHeading[index] = berth.heading;
    flotilla.gap[index] = TIED_SECONDS + random() * TIED_SPREAD;
    helm(index);
    flotilla.speed[index]! *= (PEDAL_SHARE_OF_WALK * WALK_SPEED) / SPEED_VOXELS;
    // Dropped anywhere in the cycle, so the berths fill and empty from the first minute.
    const age = random() * (HIRE_SECONDS + flotilla.gap[index]!) - flotilla.gap[index]!;
    flotilla.age[index] = age;
    if (age < 0) {
      tieUp(flotilla, index, age);
    } else {
      const bearing = random() * Math.PI * 2;
      const off = random() * HIRE_REACH;
      const x = clamp(berth.x + Math.sin(bearing) * off, ground.westX, ground.eastX);
      const landward = ground.landwardZ(x);
      flotilla.x[index] = x;
      flotilla.z[index] = clamp(berth.z + Math.cos(bearing) * off, landward, ground.seawardZ);
      flotilla.heading[index] = wrapAngle(random() * Math.PI * 2);
      launchClear(flotilla, index);
    }
  }

  // Only once every draw is dealt, so an allowance never moves the seeded ones.
  holdBeyondAllowance(flotilla, count - hired);

  for (let index = 0; index < count; index++) {
    flotilla.radius[index] = options.radii?.[flotilla.variant[index]!] ?? DEFAULT_RADIUS;
  }
  return flotilla;
}

function holdBeyondAllowance(flotilla: Flotilla, firstHire: number): void {
  let out = 0;
  for (let index = firstHire; index < flotilla.count; index++) {
    if (flotilla.age[index]! < 0) continue;
    if (out < flotilla.hireAllowed) out++;
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
  const steps = Math.min(MAX_HIRE_STEPS, Math.ceil(hireDt / HIRE_STEP));
  const step = Math.min(HIRE_STEP, hireDt / steps);
  for (let at = 0; at < steps; at++) {
    for (let index = 0; index < flotilla.count; index++) {
      if (flotilla.hired[index] === 1) stepHire(flotilla, index, step, ground);
    }
  }
}

function stepHire(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  const tied = flotilla.age[index]! < 0;
  const age = flotilla.age[index]! + dt;
  if (tied && age >= 0 && hiresOut(flotilla) >= flotilla.hireAllowed) {
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
    if (away <= BERTH_VOXELS) tieUp(flotilla, index, -flotilla.gap[index]!);
    else steerHome(flotilla, index, dt, ground);
    return;
  }
  if (away > HIRE_REACH) steerHome(flotilla, index, dt, ground);
  else drift(flotilla, index, dt, ground);
}

// Counted afresh rather than kept, so it cannot drift from the ages; only a boat due out asks.
function hiresOut(flotilla: Flotilla): number {
  let out = 0;
  for (let index = 0; index < flotilla.count; index++) {
    if (flotilla.hired[index] === 1 && flotilla.age[index]! >= 0) out++;
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
  const bearing = Math.atan2(
    flotilla.berthX[index]! - flotilla.x[index]!,
    flotilla.berthZ[index]! - flotilla.z[index]!,
  );
  const off = wrapAngle(bearing - flotilla.heading[index]!);
  const helm = (flotilla.speed[index]! / HELM_VOXELS) * dt;
  const over = Math.sign(off) * Math.min(Math.abs(off), helm);
  hold(flotilla, index, wrapAngle(flotilla.heading[index]! + over), dt, ground);
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

  // Negating the heading mirrors x and keeps z; taking it from pi mirrors z and keeps x.
  if (x < ground.westX || x > ground.eastX) {
    x = Math.min(ground.eastX, Math.max(ground.westX, x));
    heading = -heading;
  }
  const landward = ground.landwardZ(x);
  if (z < landward || z > ground.seawardZ) {
    z = Math.min(ground.seawardZ, Math.max(landward, z));
    heading = wrapAngle(Math.PI - heading);
  }

  flotilla.heading[index] = heading;
  flotilla.x[index] = x;
  flotilla.z[index] = z;
}

// Berths are closer than two boats' reach, so holding hire boats apart would
// keep them off their berths.
function berthedTogether(flotilla: Flotilla, one: number, other: number): boolean {
  if (flotilla.hired[one] === 0 || flotilla.hired[other] === 0) return false;
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
  return wrapAngle(heading + (off > 0 ? -1 : 1) * AVOID_RADIANS * dt);
}

// Module-level so a frame allocates nothing; only meaningful inside one call of avoid.
let nearest = Infinity;
let threatX = 0;
let threatZ = 0;

const lookOf = (flotilla: Flotilla, index: number): number =>
  flotilla.radius[index]! + flotilla.speed[index]! * LOOK_SECONDS;

// Tested halfway along the look and at its end: enough for a tile-wide pier against a short look.
function piersAhead(flotilla: Flotilla, index: number, aheadX: number, aheadZ: number): void {
  const look = lookOf(flotilla, index);
  for (const pier of flotilla.piers) boxAhead(flotilla, index, pier, aheadX, aheadZ, look);
  for (const island of flotilla.islands) boxAhead(flotilla, index, island, aheadX, aheadZ, look);
}

function boxAhead(
  flotilla: Flotilla,
  index: number,
  box: PierBox,
  aheadX: number,
  aheadZ: number,
  look: number,
): void {
  for (let half = 1; half <= 2; half++) {
    const along = (look * half) / 2;
    const px = flotilla.x[index]! + aheadX * along;
    const pz = flotilla.z[index]! + aheadZ * along;
    const cx = clamp(px, box.minX, box.maxX);
    const cz = clamp(pz, box.minZ, box.maxZ);
    if (along >= nearest || Math.hypot(px - cx, pz - cz) > flotilla.radius[index]!) continue;
    nearest = along;
    threatX = cx;
    threatZ = cz;
  }
}

function craftAhead(flotilla: Flotilla, index: number, aheadX: number, aheadZ: number): void {
  const look = lookOf(flotilla, index);
  for (let other = 0; other < flotilla.count; other++) {
    if (other === index || berthedTogether(flotilla, index, other)) continue;
    const rx = flotilla.x[other]! - flotilla.x[index]!;
    const rz = flotilla.z[other]! - flotilla.z[index]!;
    const along = rx * aheadX + rz * aheadZ;
    const at = Math.min(along, look);
    const off = Math.hypot(rx - aheadX * at, rz - aheadZ * at);
    if (along <= 0 || along >= nearest || off > flotilla.radius[index]! + flotilla.radius[other]!) {
      continue;
    }
    nearest = along;
    threatX = flotilla.x[other]!;
    threatZ = flotilla.z[other]!;
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
    if (other === index || berthedTogether(flotilla, index, other)) continue;
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
