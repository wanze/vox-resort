import { linearRgbOf } from '../../lighting/domain/lightGrid';
import { mix, unitAt } from '../../random/domain/hash';

export interface Fire {
  // World voxels: the middle of the bed the flames rise from.
  readonly x: number;
  readonly y: number;
  readonly z: number;
  // 0 out, 1 burning at full height.
  readonly strength: number;
}

export const MAX_FIRES = 4;
const TONGUES = 18;
const SPARKS = 4;
export const FLAMES_PER_FIRE = TONGUES + SPARKS;
export const MAX_FLAMES = MAX_FIRES * FLAMES_PER_FIRE;

export interface FlameBuffer {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly scale: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
}

export function createFlameBuffer(): FlameBuffer {
  const column = (): Float32Array => new Float32Array(MAX_FLAMES);
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

// The pit's stone ring is 3.5 voxels in: the bed stays inside it.
export const BED = 2.2;
export const HEIGHT = 9;
// Half way up the flames, so the light falls on the faces round the fire more than on its bed.
export const LIGHT_RISE = HEIGHT / 2;
const TONGUE_EDGE = 1.6;
const SPARK_EDGE = 0.35;
// Sparks go up twice as far as the flames, and drift off a voxel or two as they go.
export const SPARK_HEIGHT = 2 * HEIGHT;
const SPARK_DRIFT = 1.5;
interface Rise {
  readonly min: number;
  readonly spread: number;
}

// Seconds a tongue takes to rise and die; each its own, so the fire never pulses as one.
const RISE: Rise = { min: 0.6, spread: 0.5 };
const SPARK_RISE: Rise = { min: 1.4, spread: 1.2 };
// Seconds to catch, or to burn down once the evening is over.
const KINDLING = 4;

// The tiki torch's three, so the two fires on a beach burn alike.
const YELLOW = linearRgbOf(0xf2c33c);
const ORANGE = linearRgbOf(0xef7a2f);
const RED = linearRgbOf(0xe0473f);

const seedOf = (fire: Pick<Fire, 'x' | 'z'>): number =>
  mix(Math.imul(Math.round(fire.x), 73_856_093) ^ Math.imul(Math.round(fire.z), 19_349_663));

export function strengthAfter(strength: number, lit: boolean, seconds: number): number {
  const step = Math.max(seconds, 0) / KINDLING;
  return lit ? Math.min(1, strength + step) : Math.max(0, strength - step);
}

export interface Hearth {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Burning extends Fire {
  strength: number;
  lit: boolean;
}

// A new hearth catches from nothing; one left out burns down rather than going out at once.
export function kindle(fires: Map<string, Burning>, hearths: readonly Hearth[]): void {
  for (const fire of fires.values()) fire.lit = false;
  for (const { key, x, y, z } of hearths) {
    const fire = fires.get(key);
    if (fire) fire.lit = true;
    else fires.set(key, { x, y, z, strength: 0, lit: true });
  }
}

// The fires to draw, in `into`; a fire burnt down and not lit again is forgotten.
export function tend(fires: Map<string, Burning>, seconds: number, into: Burning[]): void {
  into.length = 0;
  for (const [key, fire] of fires) {
    fire.strength = strengthAfter(fire.strength, fire.lit, seconds);
    if (fire.strength > 0) into.push(fire);
    else if (!fire.lit) fires.delete(key);
  }
}

// What changed: the keys to put out, and the fires to light.
export function relit<T extends { readonly key: string }>(
  burning: ReadonlySet<string>,
  fires: readonly T[],
): { readonly out: readonly string[]; readonly lit: readonly T[] } {
  const wanted = new Set(fires.map((fire) => fire.key));
  return {
    out: [...burning].filter((key) => !wanted.has(key)),
    lit: fires.filter((fire) => !burning.has(fire.key)),
  };
}

function paint(out: FlameBuffer, at: number, rise: number): void {
  const [from, to, along] = rise < 0.5 ? [YELLOW, ORANGE, rise * 2] : [ORANGE, RED, rise * 2 - 1];
  out.r[at] = from[0] + (to[0] - from[0]) * along;
  out.g[at] = from[1] + (to[1] - from[1]) * along;
  out.b[at] = from[2] + (to[2] - from[2]) * along;
}

// Where a flame is `seconds` in: how far up its rise, and which rise it is on.
function phaseOf(seed: number, index: number, seconds: number, rise: Rise): [number, number] {
  const through =
    seconds / (rise.min + unitAt(seed, 3 * index) * rise.spread) + unitAt(seed, 3 * index + 1);
  const cycle = Math.floor(through);
  return [through - cycle, cycle];
}

// Each rise starts from somewhere new on the bed and leans in towards the top of the fire.
function writeTongue(
  fire: Fire,
  seed: number,
  index: number,
  seconds: number,
  out: FlameBuffer,
  at: number,
): void {
  const [rise, cycle] = phaseOf(seed, index, seconds, RISE);
  const fresh = mix(seed ^ Math.imul(cycle + 1, 0x2545_f491));
  const angle = unitAt(fresh, index) * 2 * Math.PI;
  const reach = BED * Math.sqrt(unitAt(fresh, index + TONGUES)) * (1 - 0.8 * rise);
  const tall = 0.6 + 0.4 * unitAt(seed, 3 * index + 2);
  out.x[at] = fire.x + Math.cos(angle) * reach;
  out.z[at] = fire.z + Math.sin(angle) * reach;
  out.y[at] = fire.y + rise * HEIGHT * tall * fire.strength;
  out.scale[at] = TONGUE_EDGE * (1 - 0.75 * rise) * fire.strength;
  paint(out, at, rise);
}

function writeSpark(
  fire: Fire,
  seed: number,
  index: number,
  seconds: number,
  out: FlameBuffer,
  at: number,
): void {
  const [rise, cycle] = phaseOf(seed, index, seconds, SPARK_RISE);
  const fresh = mix(seed ^ Math.imul(cycle + 1, 0x27d4_eb2f));
  const angle = unitAt(fresh, index) * 2 * Math.PI;
  const drift = rise * SPARK_DRIFT;
  out.x[at] = fire.x + Math.cos(angle) * drift;
  out.z[at] = fire.z + Math.sin(angle) * drift;
  out.y[at] = fire.y + rise * SPARK_HEIGHT * fire.strength;
  out.scale[at] = SPARK_EDGE * (1 - rise) * fire.strength;
  paint(out, at, 0.5 * rise);
}

// A fire at no strength still takes its places, drawn at no size: the count follows the fires.
export function writeFlames(fires: readonly Fire[], seconds: number, out: FlameBuffer): number {
  const shown = Math.min(fires.length, MAX_FIRES);
  for (let each = 0; each < shown; each++) {
    const fire = fires[each]!;
    const seed = seedOf(fire);
    const first = each * FLAMES_PER_FIRE;
    for (let index = 0; index < TONGUES; index++) {
      writeTongue(fire, seed, index, seconds, out, first + index);
    }
    for (let index = 0; index < SPARKS; index++) {
      writeSpark(fire, seed, TONGUES + index, seconds, out, first + TONGUES + index);
    }
  }
  return shown * FLAMES_PER_FIRE;
}
