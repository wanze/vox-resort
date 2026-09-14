/**
 * Everything afloat on the bay: where it is, which way it is pointing, and how
 * it is riding the swell.
 *
 * One structure for the buoys and the boats together, and that is the claim this
 * module makes: a moored buoy is a craft with no way on it. Both sit on the same
 * water, both are lifted and tilted by the same swell, and both are drawn by
 * writing a matrix per frame — so a buoy is a row of these columns with its
 * speed set to zero, and the step loop moves it exactly as far as that implies.
 * Two structures would have meant two step loops, two pose functions and two
 * fields, to say once that a buoy does not go anywhere.
 *
 * **Columns, not objects**, for the reason `crowd/domain/crowd.ts` gives. There
 * are a few dozen of these rather than a few hundred, so the budget is not
 * tight; the shape is the same because the two are the same kind of thing.
 *
 * **The swell is a function of the clock, not of the frame.** A craft's heave,
 * roll and pitch are read straight off an accumulated time, so they are the same
 * motion at any frame rate and a stopped clock leaves the bay still rather than
 * drifting. The *position* is integrated, because a boat that wandered as a
 * function of absolute time would jump the moment the plot was regenerated
 * under it.
 *
 * **A hire boat is on an errand; a private one is not.** The rental's pedalos
 * are the one thing here with somewhere to be: they go out, they are out for a
 * while, and then they come home to their berth in front of the hut and lie
 * there until they are taken again. That is one more state than a drifting boat
 * has, and it is carried the way the balloons carry theirs — as one signed
 * number, {@link Flotilla.age}, so the per-frame loop stays a compare. A bay
 * with no rental on it hires nothing out and every craft simply drifts.
 *
 * **Seeded**, for the reason the crowd is: `pnpm bench` only compares two runs
 * if the scene has not moved.
 */

import { createRandom } from '../../layout/domain/random';
import type { PierBox } from './piers';
import type { Mooring, Rental, SailingGround } from './swimArea';

/**
 * The longest step the bay will take, in seconds.
 *
 * A backgrounded tab reports the time it was away as one frame; without a clamp
 * every boat would cross the bay on it. The crowd and the balloons clamp their
 * own steps for the same reason and to the same tenth of a second — written
 * again rather than shared, because a boat's speed has nothing to do with how
 * fast somebody walks.
 */
export const MAX_STEP = 0.1;

/**
 * How fast a craft drifts, in voxels a second, and how far either side of that
 * the fleet is drawn from.
 *
 * 1.6 voxels is 40 cm a second, which is a rowing boat being rowed slowly and a
 * pedalo being pedalled at all. Faster reads as a motorboat, and there is not
 * one in the bay; slower and the fleet stops looking alive between one glance at
 * the plot and the next.
 */
const SPEED_VOXELS = 1.6;
const SPEED_SPREAD = 0.45;

/**
 * How hard a craft can be turning, in radians a second, and how quickly it
 * swings from one way to the other.
 *
 * The two together are the whole of the steering. Every craft is always in a
 * turn, and the turn itself swings sinusoidally, so a boat traces a slow S
 * across the bay rather than a circle — which is what a boat with somebody
 * idly at the helm actually does. A tenth of a radian a second is a turn that
 * takes a minute to come right round, so nothing ever looks like it is
 * manoeuvring.
 */
const TURN_RADIANS = 0.11;
const SWING_RATE = 0.09;

/**
 * How the swell lifts and tilts what is on it: voxels of heave, radians of roll
 * and of pitch, and the rate of each.
 *
 * Three rates, none of them a multiple of another, so no craft ever returns to
 * the same attitude twice in a row and the bay never reads as a loop. They are
 * small on purpose: a boat rolling visibly is a boat in a gale, and this is a
 * resort. What the numbers have to do is stop a hull from reading as a decal
 * lying on the water, and a tenth of a voxel of heave does that.
 */
/**
 * Seconds a pedalo is out for before it turns for home.
 *
 * Real seconds rather than resort ones, exactly as a balloon's flight is: the
 * clock starts stopped, so a hire measured against the time of day would leave
 * every pedalo frozen mid-bay the moment somebody scrubbed to sunset. A hundred
 * seconds is long enough to lose sight of one and notice it come back, and short
 * enough that the berths in front of the hut fill and empty while you are
 * looking at them.
 */
const HIRE_SECONDS = 120;

/**
 * Voxels from its berth that a hire boat is allowed to get.
 *
 * Forty-five metres, which is a great deal less than the bay is wide, and that
 * is the point twice over. A rental's boats stay in sight of the hut that hired
 * them out — nobody pedals half a kilometre and back — so a cluster of pedalos
 * off the hire beach is what the thing actually looks like. And it is what keeps
 * the trip home short: measured against a whole bay, a pedalo at forty
 * centimetres a second spent most of its life trudging back from the far end.
 *
 * A boat that reaches it is turned for home in mid-hire and drifts on as soon as
 * it is back inside, so the limit reads as a boat thinking better of it rather
 * than as a wall.
 */
const HIRE_REACH = 180;

/** Seconds a pedalo lies at its berth between one hire and the next. */
const TIED_SECONDS = 25;
const TIED_SPREAD = 45;

/**
 * How hard a boat going home puts its helm over, in radians a second.
 *
 * Far harder than the idle {@link TURN_RADIANS} swing, because this is somebody
 * steering rather than nobody: a pedalo turns in its own length, and a boat that
 * came round at a tenth of a radian a second would take half its hire to point
 * at the beach. It is a rate rather than a snap so the track still curves.
 */
const HELM_RADIANS = 0.5;

/** Voxels from its berth at which a boat is home and ties up. */
const BERTH_VOXELS = 4;

/**
 * Voxels between one berth and the next, along the shore.
 *
 * A pedalo is nine voxels across, so twelve is a clear row rather than a raft of
 * them. The row is centred on the hut and has to stay inside the corridor cut
 * through the swimming area — see `CORRIDOR_TILES` in `swimArea.ts` — which is
 * what caps how many the rental can have out at once.
 */
const BERTH_SPACING = 12;

/** Voxels seaward of the landward limit the berths lie at. */
const BERTH_OUT = 4;

/**
 * How far ahead a craft looks for something in its way, in seconds of its own
 * way, and how hard it puts the helm over when it finds something.
 *
 * Six seconds is ten voxels at the fleet's pace, on top of the craft's own
 * length — enough that a boat is seen to come round well short of a pier rather
 * than to bounce off it. The turn is sharper than the idle swing and a little
 * sharper than going home, because a boat that is avoiding something is a boat
 * somebody is steering.
 */
const LOOK_SECONDS = 6;
const AVOID_RADIANS = 0.6;

/**
 * Voxels a craft is reckoned to take up across, from its middle, when the caller
 * did not say: about a rowing boat's half-length.
 */
const DEFAULT_RADIUS = 8;

const HEAVE_VOXELS = 0.4;
const HEAVE_RATE = 1.1;
const ROLL_RADIANS = 0.06;
const ROLL_RATE = 0.83;
const PITCH_RADIANS = 0.045;
const PITCH_RATE = 1.37;

export interface FlotillaOptions {
  /** Where the buoys are moored; one buoy per mooring, and none without. */
  readonly moorings: readonly Mooring[];
  /** The model the buoys are drawn in: an index into the field's own list. */
  readonly buoyVariant: number;
  /** How many craft drift about the bay. */
  readonly craft: number;
  /**
   * The models the craft are drawn in, as indices into the same list.
   *
   * Passed rather than derived, so the one fact this module needs about the sea
   * registry — which entry is the buoy and which are boats — is stated by the
   * caller that reads the registry. See `voxel-gen/sea/index.ts`.
   */
  readonly craftVariants: readonly number[];
  /**
   * The rental's own boats: how many it has out, the model they are drawn in,
   * and the hut they belong to.
   *
   * Absent on a bay with no hire hut, which is what a plot whose beach could not
   * stand one comes out as — see `standBeachFeatures` in `resortGenerator.ts`.
   * Every craft is then a private one and nothing goes home.
   */
  readonly hire?: HireOptions | null;
  /** The water the craft keep to; the buoys are moored wherever they are moored. */
  readonly ground: SailingGround;
  /**
   * How far each model reaches from its middle, in voxels, by variant: half its
   * length, since a hull turns. Read off the art by the caller, so a new boat
   * needs no change here; a variant it does not cover gets {@link DEFAULT_RADIUS}.
   */
  readonly radii?: readonly number[];
  /** The piers out over the bay, which every craft steers round. See `piers.ts`. */
  readonly piers?: readonly PierBox[];
  /** Voxels the sea surface lies at, which everything afloat rides on. */
  readonly waterline: number;
  readonly seed: number;
}

/** What the bay needs to know about the hire trade on it. */
export interface HireOptions {
  /** Craft the rental has; the berths are laid out for exactly this many. */
  readonly count: number;
  /** The model they are drawn in: an index into the field's own list. */
  readonly variant: number;
  /** Where the hut stands, in voxels. The berths are the water in front of it. */
  readonly rental: Rental;
}

/** Everything afloat, as columns. See the note at the top of the file. */
export interface Flotilla {
  readonly count: number;
  /** Which model each is drawn in. */
  readonly variant: Int32Array;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Radians from +z, which is the way every hull is drawn pointing. */
  readonly heading: Float32Array;
  /** Voxels a second it is making. Zero is a buoy, and there is nothing else. */
  readonly speed: Float32Array;
  /** How hard it is turning at the top of its swing, and where in that swing. */
  readonly turn: Float32Array;
  readonly swing: Float32Array;
  /** Where in the swell it is riding, so no two heave together. */
  readonly ride: Float32Array;
  /**
   * Whether this one belongs to the rental, and so has somewhere to be.
   *
   * A column rather than a variant check, because what makes a craft a hire
   * craft is who owns it and not what it is drawn as: the day the rental lets
   * out rowing boats too, nothing here changes.
   */
  readonly hired: Uint8Array;
  /**
   * Seconds into the current hire, or negative while the boat is lying at its
   * berth. One number for three states — tied up, out, and on its way home —
   * which is what keeps the per-frame loop to an add and two compares. Unused,
   * and left at zero, for anything nobody hires.
   */
  readonly age: Float32Array;
  /** The berth a hire craft lies at when it is not out. */
  readonly berthX: Float32Array;
  readonly berthZ: Float32Array;
  /** The way it lies there: bow to the hut, which is bow to the beach. */
  readonly berthHeading: Float32Array;
  /**
   * Seconds it lies at that berth between one hire and the next.
   *
   * Drawn once, when the bay is built, rather than each time a boat ties up.
   * That keeps the step loop free of the seeded generator — which is what lets
   * `stepFlotilla` be a pure function of the frame — at the cost of each boat
   * having the same turnaround every time, which nothing can see.
   */
  readonly gap: Float32Array;
  /** Voxels each reaches from its middle: what nothing else may come inside. */
  readonly radius: Float32Array;
  /** The piers every craft steers round. */
  readonly piers: readonly PierBox[];
  readonly waterline: number;
  /** Seconds since the bay was launched; what the swell is read off. */
  clock: number;
}

/** Where one craft is, and how it is sitting on the water. */
export interface AfloatPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians about the vertical: the way the bow points. */
  readonly heading: number;
  /** Radians it is heeled over, and radians bow-up. */
  readonly roll: number;
  readonly pitch: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Brings a heading back into -π..π, so it cannot drift out of precision. */
const wrapAngle = (radians: number): number =>
  radians - Math.PI * 2 * Math.round(radians / (Math.PI * 2));

/**
 * The berth one of the rental's boats lies at, in voxels.
 *
 * A row centred on the hut and parallel to the shore, laid out in the corridor
 * the swimming area is cut back for — so the row's own distance off the sand
 * comes from the sailing ground rather than being a second number that would
 * have to agree with it. Take the corridor away and the berths would be four
 * tiles out in the bathing area, which is precisely why the corridor exists.
 */
function berthFor(
  hire: HireOptions,
  ground: SailingGround,
  berth: number,
): { x: number; z: number; heading: number } {
  const x = hire.rental.x + (berth - (hire.count - 1) / 2) * BERTH_SPACING;
  const z = ground.landwardZ(x) + BERTH_OUT;
  // Bow to the hut, which on every bay is bow to the beach: a moored boat lies
  // the way it was pulled in, and that is the way somebody stepped off it.
  return { x, z, heading: Math.atan2(hire.rental.x - x, hire.rental.z - z) };
}

/**
 * The bay's craft and its buoys, all of them on the water.
 *
 * The buoys come first and in mooring order, which is what lets the field draw
 * one instance per mooring without being told twice where they are; the private
 * craft are then scattered over the sailing ground, and the rental's own boats
 * come last. A bay with no moorings and no craft comes back empty, and the field
 * draws nothing.
 */
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
    waterline: options.waterline,
    clock: 0,
  };

  /** The three columns every boat carries, hired or not. */
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
    // A buoy is symmetrical about its mast, so its heading is only ever seen in
    // the topmark — which is exactly enough that a line of them stood at one
    // angle reads as one model stamped along the water.
    flotilla.heading[index] = wrapAngle(random() * Math.PI * 2);
    flotilla.ride[index] = random() * Math.PI * 2;
  }

  for (let boat = 0; boat < craft; boat++) {
    const index = moorings.length + boat;
    flotilla.variant[index] = craftVariants[Math.floor(random() * craftVariants.length)]!;
    flotilla.x[index] = ground.westX + random() * (ground.eastX - ground.westX);
    // Between the buoys and the offing at the column it was dropped in, so a
    // craft starts in the water it is allowed into rather than being steered out
    // of the swimming area on the first frame.
    const landward = ground.landwardZ(flotilla.x[index]!);
    flotilla.z[index] = landward + random() * Math.max(0, ground.seawardZ - landward);
    flotilla.heading[index] = wrapAngle(random() * Math.PI * 2);
    helm(index);
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
    // Dropped anywhere in the cycle rather than all tied up together, so the bay
    // opens with some of them out and the berths fill and empty from the first
    // minute instead of the whole rack leaving at once. One that starts out
    // starts within its own reach of the hut, not anywhere in the bay.
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
    }
  }

  for (let index = 0; index < count; index++) {
    flotilla.radius[index] = options.radii?.[flotilla.variant[index]!] ?? DEFAULT_RADIUS;
  }
  return flotilla;
}

/** Lays a hire boat on its berth and holds it there for `age` seconds. */
function tieUp(flotilla: Flotilla, index: number, age: number): void {
  flotilla.age[index] = age;
  flotilla.x[index] = flotilla.berthX[index]!;
  flotilla.z[index] = flotilla.berthZ[index]!;
  flotilla.heading[index] = flotilla.berthHeading[index]!;
}

/**
 * Moves the bay on by a frame.
 *
 * Three things can happen to one row of it, and which one is decided by two
 * compares: a buoy has no way on it and stays where it was moored; a hire boat
 * whose time is up steers for its berth; everything else wanders.
 */
export function stepFlotilla(flotilla: Flotilla, dt: number, ground: SailingGround): void {
  flotilla.clock += dt;
  for (let index = 0; index < flotilla.count; index++) {
    if (flotilla.speed[index] === 0) continue;
    if (flotilla.hired[index] === 0) {
      drift(flotilla, index, dt, ground);
      continue;
    }

    stepHire(flotilla, index, dt, ground);
  }
}

/**
 * One of the rental's boats, for a frame: out, turning back, or lying up.
 *
 * Its time being up and its having gone too far are the same move — steer for
 * the berth — and differ only in what happens on arrival. That is why they are
 * one branch: a boat at the end of its hire ties up, and one that has merely
 * wandered past {@link HIRE_REACH} is back inside it long before the berth and
 * simply carries on drifting.
 */
function stepHire(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  const age = flotilla.age[index]! + dt;
  flotilla.age[index] = age;
  // Lying at the berth until its gap runs out, and then taken out again.
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

/**
 * One craft wandering, for a frame.
 *
 * A craft that reaches a limit is turned back rather than stopped, and turned by
 * mirroring its heading about the limit it met — which is what a boat put about
 * looks like and, unlike steering it towards the middle, cannot ever leave one
 * grinding along the edge of the ground. The landward limit is the line of
 * buoys, so the same reflection is what keeps the boats out of the swimming
 * area. See `swimArea.ts`.
 */
function drift(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  const swinging = Math.sin(flotilla.clock * SWING_RATE + flotilla.swing[index]!);
  const heading = wrapAngle(flotilla.heading[index]! + flotilla.turn[index]! * swinging * dt);
  hold(flotilla, index, heading, dt, ground);
}

/**
 * One hire boat steering for its berth, for a frame.
 *
 * The helm is put over towards the bearing to the berth at a limited rate rather
 * than snapped onto it, so a boat comes round in a curve; and the same limits
 * are then applied as to a drifting one, which is what stops a boat cutting the
 * corner of the bathing area on its way in. It can go straight home because the
 * swimming area is *cut back* in front of the hut — see `CORRIDOR_TILES` in
 * `swimArea.ts`, which is the whole reason the rental has a corridor at all.
 */
function steerHome(flotilla: Flotilla, index: number, dt: number, ground: SailingGround): void {
  const bearing = Math.atan2(
    flotilla.berthX[index]! - flotilla.x[index]!,
    flotilla.berthZ[index]! - flotilla.z[index]!,
  );
  const off = wrapAngle(bearing - flotilla.heading[index]!);
  const over = Math.sign(off) * Math.min(Math.abs(off), HELM_RADIANS * dt);
  hold(flotilla, index, wrapAngle(flotilla.heading[index]! + over), dt, ground);
}

/**
 * Runs one craft a frame's worth along a heading, round whatever is in its way,
 * and keeps it in the bay.
 *
 * Three steps, in the order they have to win in. Something ahead turns the
 * craft away from it, overriding the helm it was given for the frame; anything
 * it still ends up inside pushes it back out, so no hull is ever seen through a
 * pier or another hull however the steering went; and the limits of the ground
 * come last, because leaving the bay is the one thing that must never happen.
 */
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

  // Mirrored about the limit: negating the heading flips the x it is made of
  // and keeps the z, and taking it from π flips the z and keeps the x.
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

/**
 * Whether two craft are left to lie alongside each other.
 *
 * The rental's own boats, both close in to their row of berths: a pedalo coming
 * home ties up twelve voxels from the next one, and two boats' reach is more
 * than that, so holding them apart would keep every one of them off its own
 * berth — or send it circling the row, turned away by its neighbours.
 */
function berthedTogether(flotilla: Flotilla, one: number, other: number): boolean {
  if (flotilla.hired[one] === 0 || flotilla.hired[other] === 0) return false;
  const oneIn = nearBerth(flotilla, one);
  const otherIn = nearBerth(flotilla, other);
  // A boat on its way home is let through the row whatever distance it is
  // still out: turned away by the boats already tied up, it would circle.
  return (
    (oneIn && otherIn) || (homing(flotilla, one) && otherIn) || (homing(flotilla, other) && oneIn)
  );
}

const homing = (flotilla: Flotilla, index: number): boolean => flotilla.age[index]! >= HIRE_SECONDS;

/** Voxels from its berth inside which a hire boat is coming in to the row. */
const BERTH_APPROACH = BERTH_SPACING * 3;

function nearBerth(flotilla: Flotilla, index: number): boolean {
  return (
    Math.hypot(
      flotilla.x[index]! - flotilla.berthX[index]!,
      flotilla.z[index]! - flotilla.berthZ[index]!,
    ) < BERTH_APPROACH
  );
}

/** Whether a craft stays put whatever bumps it: a buoy, or a boat tied up. */
const fixed = (flotilla: Flotilla, index: number): boolean =>
  flotilla.speed[index] === 0 || (flotilla.hired[index] === 1 && flotilla.age[index]! < 0);

/**
 * The heading a craft takes this frame, given what is in front of it.
 *
 * It looks along its heading for {@link LOOK_SECONDS} of way plus its own reach,
 * and takes the nearest pier or craft that line comes within reach of. If there
 * is one it turns away from it — away from the side it lies on, and to
 * starboard when it is dead ahead, which is the rule of the road and is the
 * same way for both of two boats meeting head on, so they part rather than
 * mirroring each other for ever.
 *
 * A loop over every other craft, and it should be: there are a few dozen, which
 * is a few hundred pairs a frame, and a spatial index would cost more to keep
 * than it could save.
 */
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

/**
 * The nearest thing in a craft's way found so far this frame, as how far along
 * its look it is and the point to turn away from. Module-level, like the
 * matrices a field refills, so a frame allocates nothing; only meaningful inside
 * one call of {@link avoid}.
 */
let nearest = Infinity;
let threatX = 0;
let threatZ = 0;

/** How far ahead a craft looks: its own reach, and some seconds of its way. */
const lookOf = (flotilla: Flotilla, index: number): number =>
  flotilla.radius[index]! + flotilla.speed[index]! * LOOK_SECONDS;

/**
 * Any pier the look comes within reach of, tested halfway along the look and at
 * the end of it — close enough for a rectangle a tile across against a look of
 * under twenty voxels.
 */
function piersAhead(flotilla: Flotilla, index: number, aheadX: number, aheadZ: number): void {
  const look = lookOf(flotilla, index);
  for (const pier of flotilla.piers) {
    for (let half = 1; half <= 2; half++) {
      const along = (look * half) / 2;
      const px = flotilla.x[index]! + aheadX * along;
      const pz = flotilla.z[index]! + aheadZ * along;
      const cx = clamp(px, pier.minX, pier.maxX);
      const cz = clamp(pz, pier.minZ, pier.maxZ);
      if (along >= nearest || Math.hypot(px - cx, pz - cz) > flotilla.radius[index]!) continue;
      nearest = along;
      threatX = cx;
      threatZ = cz;
    }
  }
}

/** Any craft ahead that the look passes within both craft's reach of. */
function craftAhead(flotilla: Flotilla, index: number, aheadX: number, aheadZ: number): void {
  const look = lookOf(flotilla, index);
  for (let other = 0; other < flotilla.count; other++) {
    if (other === index || berthedTogether(flotilla, index, other)) continue;
    const rx = flotilla.x[other]! - flotilla.x[index]!;
    const rz = flotilla.z[other]! - flotilla.z[index]!;
    const along = rx * aheadX + rz * aheadZ;
    // How far the other lies off the look, at its nearest point along it.
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

/** Where {@link shoveClear} left the craft it was handed; see there. */
let shovedX = 0;
let shovedZ = 0;

/**
 * Where a craft that has moved to `x, z` actually ends up, written to
 * {@link shovedX} and {@link shovedZ}: pushed out of any other craft it
 * overlaps, and then out of any pier it is inside — the piers second, so being
 * shouldered by another boat can never leave one in the decking.
 *
 * Two craft that are both under way each take half of the overlap on their own
 * turn, so nothing here ever writes to a craft other than the one being
 * stepped; one that is fixed — a buoy, a boat tied up — takes none of it.
 */
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
}

/**
 * Pushes the shoved point out of one pier grown by `reach`, along whichever of
 * its sides is nearest — never its shoreward end, which is the beach, and where
 * the landward limit would only push the craft straight back into the decking.
 */
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

/**
 * How one craft is sitting on the water right now.
 *
 * The attitude is read off the clock rather than integrated, so it is the same
 * swell at any frame rate: three sines of different periods, out of phase per
 * craft, which is as much sea state as a resort wants.
 */
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
