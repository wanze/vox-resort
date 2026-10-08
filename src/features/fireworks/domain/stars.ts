import { SEA_LEVEL } from '../../rendering/domain/terrainSurface';
import { unitAt } from '../../random/domain/hash';
import {
  DRAG,
  GRAVITY,
  LIFE_SECONDS,
  LONGEST_LIFE,
  MAX_RISE,
  SPARK_LIFE,
  SPARKS,
  SPARKS_FROM,
  SPARKS_SPREAD,
} from './shells';
import { firstLaunchedFrom, type Shell, type Show } from './show';

// One draw call's worth: the grand finale peaks well under it (stars.test.ts).
export const MAX_INSTANCES = 4_096;

const STAR_SIZE = 2.4;
const SPARK_SIZE = 1.3;
const HEAD_SIZE = 2;
const CORE_SECONDS = 0.1;
// Each star burns out a little before or after its neighbours, so a burst thins rather than blinks out.
const LIFE_JITTER = 0.2;
const TRAIL = 3;
// Of the rise, between one trail spark and the next.
const TRAIL_STEP = 0.05;
const TRAIL_FADE = 0.55;
const HEAD = { r: 1, g: 0.78, b: 0.48 } as const;
const BLINK_SECONDS = 0.06;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const ALIVE_SECONDS = MAX_RISE + LONGEST_LIFE;

export interface StarBuffer {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly scale: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
}

export function createStarBuffer(): StarBuffer {
  const column = (): Float32Array => new Float32Array(MAX_INSTANCES);
  return {
    x: column(),
    y: column(),
    z: column(),
    scale: column(),
    r: column(),
    g: column(),
    b: column(),
  };
}

// Reused per star, so a frame allocates nothing.
const direction = { x: 0, y: 0, z: 0 };

// A jittered Fibonacci sphere, so a peony is even all round.
function sphereDirection(shell: Shell, star: number): void {
  const y = 1 - (2 * (star + 0.5)) / shell.stars;
  const across = Math.sqrt(Math.max(0, 1 - y * y));
  const turn = star * GOLDEN_ANGLE + unitAt(shell.seed, star) * 0.4;
  direction.x = Math.cos(turn) * across;
  direction.y = y;
  direction.z = Math.sin(turn) * across;
}

function ringDirection(shell: Shell, star: number): void {
  const tilt = (unitAt(shell.seed, -1) - 0.5) * Math.PI * 0.7;
  const yaw = unitAt(shell.seed, -2) * Math.PI;
  const turn = (2 * Math.PI * star) / shell.stars;
  const x = Math.cos(turn);
  const y = Math.sin(turn) * Math.sin(tilt);
  const z = Math.sin(turn) * Math.cos(tilt);
  direction.x = x * Math.cos(yaw) + z * Math.sin(yaw);
  direction.y = y;
  direction.z = z * Math.cos(yaw) - x * Math.sin(yaw);
}

function put(out: StarBuffer, at: number, x: number, y: number, z: number, scale: number): boolean {
  if (y < SEA_LEVEL || scale <= 0) return false;
  out.x[at] = x;
  out.y[at] = y;
  out.z[at] = z;
  out.scale[at] = scale;
  return true;
}

function paint(out: StarBuffer, at: number, colour: number, bright: number): void {
  out.r[at] = (((colour >> 16) & 0xff) / 255) * bright;
  out.g[at] = (((colour >> 8) & 0xff) / 255) * bright;
  out.b[at] = ((colour & 0xff) / 255) * bright;
}

function writeRising(shell: Shell, age: number, out: StarBuffer, count: number): number {
  let written = count;
  for (let step = 0; step <= TRAIL && written < MAX_INSTANCES; step++) {
    const through = Math.max(0, age / shell.rise - step * TRAIL_STEP);
    // Slowing as it climbs, as a shell does.
    const eased = 1 - (1 - through) * (1 - through);
    const { site } = shell;
    const x = site.x + (shell.burstX - site.x) * eased;
    const y = site.y + (shell.burstY - site.y) * eased;
    const z = site.z + (shell.burstZ - site.z) * eased;
    const fade = TRAIL_FADE ** step;
    if (!put(out, written, x, y, z, HEAD_SIZE * fade)) continue;
    out.r[written] = HEAD.r * fade;
    out.g[written] = HEAD.g * fade;
    out.b[written] = HEAD.b * fade;
    written++;
  }
  return written;
}

function starScale(shell: Shell, star: number, t: number): number {
  const life = LIFE_SECONDS[shell.kind] * (1 - LIFE_JITTER * unitAt(shell.seed, star + 7_919));
  return t >= life ? 0 : STAR_SIZE * (1 - (t / life) ** 2);
}

function placeStar(
  shell: Shell,
  star: number,
  t: number,
  scale: number,
  out: StarBuffer,
  at: number,
): boolean {
  if (shell.kind === 'ring') ringDirection(shell, star);
  else sphereDirection(shell, star);
  const push = shell.radius * (1 - Math.exp(-DRAG[shell.kind] * t));
  const fall = (GRAVITY[shell.kind] * t * t) / 2;
  return put(
    out,
    at,
    shell.burstX + direction.x * push,
    shell.burstY + direction.y * push - fall,
    shell.burstZ + direction.z * push,
    scale,
  );
}

function writeBurst(shell: Shell, t: number, out: StarBuffer, count: number): number {
  let written = count;
  const life = LIFE_SECONDS[shell.kind];
  for (let star = 0; star < shell.stars && written < MAX_INSTANCES; star++) {
    if (!placeStar(shell, star, t, starScale(shell, star, t), out, written)) continue;
    if (t < CORE_SECONDS) paint(out, written, 0xffffff, 1);
    else paint(out, written, shell.colour, Math.exp(-t / life));
    written++;
  }
  return shell.kind === 'crackle' ? writeSparks(shell, t, out, written) : written;
}

// White crackle that blinks on and off along the stars' paths once the burst has spread.
function writeSparks(shell: Shell, t: number, out: StarBuffer, count: number): number {
  let written = count;
  const blink = Math.floor(t / BLINK_SECONDS);
  for (let spark = 0; spark < SPARKS && written < MAX_INSTANCES; spark++) {
    const from = SPARKS_FROM + SPARKS_SPREAD * unitAt(shell.seed, spark + 104_729);
    if (t < from || t >= from + SPARK_LIFE) continue;
    if (unitAt(shell.seed ^ blink, spark) < 0.4) continue;
    const star = Math.floor(unitAt(shell.seed, spark + 15_485) * shell.stars);
    if (!placeStar(shell, star, t, SPARK_SIZE, out, written)) continue;
    paint(out, written, 0xffffff, 1);
    written++;
  }
  return written;
}

// Oldest shells first, so past the budget it is the newest launches that go unseen.
export function writeStars(
  show: Show,
  playhead: number,
  out: StarBuffer,
  stopAt = Infinity,
): number {
  if (playhead < 0 || playhead >= show.length) return 0;
  const { shells } = show;
  let count = 0;
  const first = firstLaunchedFrom(shells, playhead - ALIVE_SECONDS);
  for (let index = first; index < shells.length; index++) {
    const shell = shells[index]!;
    if (shell.launchAt > playhead || shell.launchAt > stopAt) break;
    const age = playhead - shell.launchAt;
    count =
      age < shell.rise
        ? writeRising(shell, age, out, count)
        : writeBurst(shell, age - shell.rise, out, count);
    if (count >= MAX_INSTANCES) break;
  }
  return count;
}

export function peakInstances(show: Show, step: number): number {
  const out = createStarBuffer();
  let peak = 0;
  for (let playhead = 0; playhead < show.length; playhead += step) {
    peak = Math.max(peak, writeStars(show, playhead, out));
  }
  return peak;
}
