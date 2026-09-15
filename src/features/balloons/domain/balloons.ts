/**
 * The lucky balloons: who is holding one, when they let it go, and where it has
 * drifted to since.
 *
 * A resort ritual rather than a simulation. At dusk the beach lets paper
 * lanterns go, a few at a time, and they climb out of the frame over the next
 * minute or so on whatever wind is blowing. That is the whole of it.
 *
 * **Columns, not objects**, for the reason `crowd/domain/crowd.ts` gives: a
 * balloon is written every frame, and nothing here should be anything for the
 * collector to walk sixty times a second. There are a few dozen of them rather
 * than a few hundred, so the budget is not tight — the shape is the same because
 * the two are the same kind of thing, and a reader who knows one knows the other.
 *
 * **Driven by elapsed seconds, gated on the time of day.** The altitude is not a
 * function of the clock, and that is deliberate: the clock starts stopped, so a
 * sky that was a function of it would hang a dozen balloons motionless in the
 * air the moment somebody scrubbed to sunset — which is exactly the moment they
 * are worth looking at. What the time of day decides instead is
 * {@link releaseStrength}: how readily the next balloon goes up. Scrub to dusk
 * and stop, and the beach keeps letting them go; scrub to noon, and the ones
 * already up finish their flight and nobody lights another.
 *
 * **Seeded**, for the reason the crowd is: `pnpm bench` only compares two runs
 * if the scene has not moved.
 */

import { createRandom } from '../../layout/domain/random';
import { SUNSET_TIME, normalizeTime, smoothstep } from '../../lighting/domain/dayNight';

/**
 * How long one balloon's flight lasts, in seconds.
 *
 * Long enough to watch one go — a little over a minute from the sand to out of
 * sight — and short enough that the beach can let a whole pool of them go twice
 * in an evening.
 */
export const FLIGHT_SECONDS = 72;

/**
 * How high a balloon climbs over that flight, in voxels.
 *
 * 75 m, which is four voxels a second: about a metre a second, the rate a paper
 * lantern actually rises at. Past that it is a point of light against the sky
 * and the fade below has taken it anyway.
 */
const RISE_VOXELS = 288;

/** How far either side of that rate the pool is drawn from. */
const RISE_SPREAD = 0.18;

/**
 * The evening breeze, in voxels a second, and how far a balloon is allowed to
 * disagree with it.
 *
 * One wind for the whole beach rather than a direction each: balloons let go
 * together drift together, and a pool that fanned out evenly in every direction
 * reads as a screensaver rather than as a sky. The spread is what keeps them
 * from moving as one rigid body.
 */
const WIND_VOXELS = 1.4;
const WIND_SPREAD = 0.45;

/** How far a balloon wanders across its own drift, and how quickly. */
const SWAY_VOXELS = 2.6;
const SWAY_RATE = 0.42;

/**
 * How much of the flight is spent growing in and fading out, as fractions.
 *
 * The balloon is scaled rather than faded, because the glow it is drawn with is
 * opaque and giving the whole field a transparent pass would cost the sort of
 * sorting a few dozen quads are not worth. A lantern swelling as it is lit and
 * dwindling as it climbs away is what both ends look like anyway.
 */
const LIGHTING_UP = 0.05;
const CLIMBING_AWAY = 0.3;

/** Seconds a balloon waits on the sand between one flight and the next. */
const GAP_SECONDS = 7;
const GAP_SPREAD = 13;

/** Where a balloon can be let go from: a spot on the sand. */
export interface ReleaseSite {
  readonly x: number;
  readonly z: number;
  /** The height of the sand there; balloons leave from the ground. */
  readonly y: number;
}

export interface BalloonsOptions {
  /** Spots on the beach; a resort with no beach gets no balloons. */
  readonly sites: readonly ReleaseSite[];
  /** How many balloons the beach can have in the air and waiting, together. */
  readonly count: number;
  /** How many models they are drawn in; a balloon's variant indexes into them. */
  readonly variants: number;
  readonly seed: number;
}

/** Every balloon, as columns. See the note at the top of the file. */
export interface Balloons {
  readonly count: number;
  /** Which model each balloon is drawn in. */
  readonly variant: Int32Array;
  /** Where this flight started. */
  readonly fromX: Float32Array;
  readonly fromY: Float32Array;
  readonly fromZ: Float32Array;
  /** Voxels a second it climbs and drifts at. */
  readonly rise: Float32Array;
  readonly windX: Float32Array;
  readonly windZ: Float32Array;
  /** Where in its own sway it is, so no two wander in step. */
  readonly sway: Float32Array;
  /**
   * Seconds into the flight, or negative while the balloon is still being held
   * on the sand. One number for both states, which is what keeps the per-frame
   * loop down to an add and a compare.
   */
  readonly age: Float32Array;
  readonly random: () => number;
}

/** Where one balloon is, and how big it is drawn. */
export interface BalloonPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 0 while it is waiting, up to 1 in mid-flight. */
  readonly scale: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * How readily the beach is letting balloons go, 0..1, at a moment of the day.
 *
 * Up as the sun goes down and out well before midnight, because "at dusk" is
 * the whole of the ritual: balloons going up at three in the morning are not a
 * resort, they are a light source. The band is written against the clock rather
 * than against the sun's elevation — unlike everything in `dayNight.ts`, which
 * has to follow the sun because it *is* the sun — since what decides this is
 * the hour people come down to the beach for it.
 *
 * It opens an hour before {@link SUNSET_TIME}, is fully up for the blue hour
 * after it, and has faded out by twenty to midnight. The fade has to be over
 * before midnight rather than merely near it: the clock wraps to 0 there, and a
 * band still fading at 23:59 would drop to nothing between one minute and the
 * next.
 */
export function releaseStrength(time: number): number {
  const clock = normalizeTime(time);
  return (
    smoothstep(SUNSET_TIME - 0.04, SUNSET_TIME + 0.02, clock) *
    (1 - smoothstep(SUNSET_TIME + 0.05, SUNSET_TIME + 0.09, clock))
  );
}

/** Puts a balloon back on the sand, waiting for somebody to light it. */
function hold(balloons: Balloons, index: number): void {
  balloons.age[index] = -(GAP_SECONDS + balloons.random() * GAP_SPREAD);
}

/** Lights one, at a spot drawn from the beach, and starts its flight. */
function release(balloons: Balloons, index: number, sites: readonly ReleaseSite[]): void {
  const site = sites[Math.floor(balloons.random() * sites.length)]!;
  balloons.fromX[index] = site.x;
  balloons.fromY[index] = site.y;
  balloons.fromZ[index] = site.z;
  balloons.age[index] = 0;
}

/**
 * The balloons a beach can let go, all of them waiting.
 *
 * Every balloon starts held, with its own gap already running, so the first
 * dusk fills the sky in rather than launching the whole pool on one frame. A
 * plot with no sand comes back with no balloons at all, which is a beach that
 * is not there rather than a mistake — the field then draws nothing.
 */
export function createBalloons(options: BalloonsOptions): Balloons {
  const { sites, variants, seed } = options;
  const count = sites.length === 0 || variants === 0 ? 0 : Math.max(0, options.count);
  const random = createRandom(seed);

  const balloons: Balloons = {
    count,
    variant: new Int32Array(count),
    fromX: new Float32Array(count),
    fromY: new Float32Array(count),
    fromZ: new Float32Array(count),
    rise: new Float32Array(count),
    windX: new Float32Array(count),
    windZ: new Float32Array(count),
    sway: new Float32Array(count),
    age: new Float32Array(count),
    random,
  };

  // One breeze for the whole beach; see WIND_VOXELS.
  const heading = random() * Math.PI * 2;
  const base = RISE_VOXELS / FLIGHT_SECONDS;
  for (let index = 0; index < count; index++) {
    balloons.variant[index] = Math.floor(random() * variants);
    balloons.rise[index] = base * (1 + (random() * 2 - 1) * RISE_SPREAD);
    const veer = heading + (random() * 2 - 1) * WIND_SPREAD;
    const strength = WIND_VOXELS * (0.7 + random() * 0.6);
    balloons.windX[index] = Math.sin(veer) * strength;
    balloons.windZ[index] = Math.cos(veer) * strength;
    balloons.sway[index] = random() * Math.PI * 2;
    // Somewhere to be before the first one goes up, so nothing is drawn on a
    // resort that opens at noon.
    balloons.fromX[index] = sites[0]!.x;
    balloons.fromY[index] = sites[0]!.y;
    balloons.fromZ[index] = sites[0]!.z;
    hold(balloons, index);
  }
  return balloons;
}

/**
 * Moves every balloon on by a frame.
 *
 * `readiness` is {@link releaseStrength} at the current time of day, and it is
 * only ever read at the moment a balloon's gap runs out: a flight already begun
 * finishes whatever the clock does, so scrubbing past midnight does not blink a
 * sky full of lanterns out of existence.
 */
export function stepBalloons(
  balloons: Balloons,
  dt: number,
  readiness: number,
  sites: readonly ReleaseSite[],
): void {
  if (sites.length === 0) return;
  for (let index = 0; index < balloons.count; index++) {
    const age = balloons.age[index]! + dt;
    balloons.age[index] = age;
    if (age < 0) continue;
    if (age >= FLIGHT_SECONDS) {
      hold(balloons, index);
    } else if (age - dt < 0) {
      // The gap has just run out. Whether anybody lights it is the only thing
      // the time of day decides.
      if (balloons.random() < readiness) release(balloons, index, sites);
      else hold(balloons, index);
    }
  }
}

/**
 * Where a balloon is now.
 *
 * The flight is worked out from its age rather than integrated frame by frame,
 * so it is the same flight at any frame rate and a stopped clock does not drift
 * it. A balloon still being held comes back at zero scale, which is the field's
 * way of drawing nothing without taking an instance slot away from anybody.
 */
export function poseOf(balloons: Balloons, index: number): BalloonPose {
  const age = balloons.age[index]!;
  if (age < 0 || age >= FLIGHT_SECONDS) {
    return {
      x: balloons.fromX[index]!,
      y: balloons.fromY[index]!,
      z: balloons.fromZ[index]!,
      scale: 0,
    };
  }
  const through = age / FLIGHT_SECONDS;
  const swing = Math.sin(age * SWAY_RATE + balloons.sway[index]!) * SWAY_VOXELS * through;
  return {
    x: balloons.fromX[index]! + balloons.windX[index]! * age + swing,
    y: balloons.fromY[index]! + balloons.rise[index]! * age,
    z: balloons.fromZ[index]! + balloons.windZ[index]! * age,
    scale: Math.min(clamp01(through / LIGHTING_UP), clamp01((1 - through) / CLIMBING_AWAY)),
  };
}

/** How many balloons are in the air right now, which the HUD reports. */
export function flyingCount(balloons: Balloons): number {
  let flying = 0;
  for (let index = 0; index < balloons.count; index++) {
    const age = balloons.age[index]!;
    if (age >= 0 && age < FLIGHT_SECONDS) flying++;
  }
  return flying;
}
