// Driven by elapsed seconds, not the sim clock: the clock starts stopped, and balloons tied to it would
// hang motionless the moment somebody scrubs to sunset.

import { createRandom } from '../../layout/domain/random';
import { SUNSET_TIME, normalizeTime, smoothstep } from '../../lighting/domain/dayNight';

export const FLIGHT_SECONDS = 72;

// About a metre a second, the rate a paper lantern actually rises at.
const RISE_VOXELS = 288;

const RISE_SPREAD = 0.18;

// One wind for the whole beach: balloons let go together drift together.
const WIND_VOXELS = 1.4;
const WIND_SPREAD = 0.45;

const SWAY_VOXELS = 2.6;
const SWAY_RATE = 0.42;

// Scaled rather than faded: the glow material is opaque, and a transparent pass is not worth it.
const LIGHTING_UP = 0.05;
const CLIMBING_AWAY = 0.3;

const GAP_SECONDS = 7;
const GAP_SPREAD = 13;

export interface ReleaseSite {
  readonly x: number;
  readonly z: number;
  readonly y: number;
}

export interface BalloonsOptions {
  readonly sites: readonly ReleaseSite[];
  readonly count: number;
  readonly variants: number;
  readonly seed: number;
}

export interface Balloons {
  readonly count: number;
  readonly variant: Int32Array;
  readonly fromX: Float32Array;
  readonly fromY: Float32Array;
  readonly fromZ: Float32Array;
  readonly rise: Float32Array;
  readonly windX: Float32Array;
  readonly windZ: Float32Array;
  readonly sway: Float32Array;
  // Negative while the balloon is still held on the sand.
  readonly age: Float32Array;
  readonly random: () => number;
}

export interface BalloonPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// The fade must be over before midnight, where the clock wraps to 0.
export function releaseStrength(time: number): number {
  const clock = normalizeTime(time);
  return (
    smoothstep(SUNSET_TIME - 0.04, SUNSET_TIME + 0.02, clock) *
    (1 - smoothstep(SUNSET_TIME + 0.05, SUNSET_TIME + 0.09, clock))
  );
}

function hold(balloons: Balloons, index: number): void {
  balloons.age[index] = -(GAP_SECONDS + balloons.random() * GAP_SPREAD);
}

function release(balloons: Balloons, index: number, sites: readonly ReleaseSite[]): void {
  const site = sites[Math.floor(balloons.random() * sites.length)]!;
  balloons.fromX[index] = site.x;
  balloons.fromY[index] = site.y;
  balloons.fromZ[index] = site.z;
  balloons.age[index] = 0;
}

// Every balloon starts held with its own gap running, so the first dusk fills the sky in gradually.
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
    // Somewhere to be before the first one goes up, so nothing is drawn on a resort that opens at noon.
    balloons.fromX[index] = sites[0]!.x;
    balloons.fromY[index] = sites[0]!.y;
    balloons.fromZ[index] = sites[0]!.z;
    hold(balloons, index);
  }
  return balloons;
}

// readiness is only read when a gap runs out, so a flight already begun always finishes.
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
      if (balloons.random() < readiness) release(balloons, index, sites);
      else hold(balloons, index);
    }
  }
}

// Worked out from age rather than integrated, so it is frame-rate independent and a stopped clock does not drift it.
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

export function flyingCount(balloons: Balloons): number {
  let flying = 0;
  for (let index = 0; index < balloons.count; index++) {
    const age = balloons.age[index]!;
    if (age >= 0 && age < FLIGHT_SECONDS) flying++;
  }
  return flying;
}
