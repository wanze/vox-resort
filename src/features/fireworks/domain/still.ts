import { mix, unitOf } from '../../random/domain/hash';
import type { LaunchSite } from './launch';
import { planShow, type Show } from './show';
import { createStarBuffer, writeStars, type StarBuffer } from './stars';

// A dozen looks, so the photo catches bursts rather than the dark between two launches.
const LOOKS = 12;

// Smaller than this, a star is a fading ember or a crackle spark, not what the eye goes to.
const BRIGHT = 1.4;

const DEGREE = Math.PI / 180;
const AIM_FOV = { min: 35, max: 60 } as const;
// The bursts fill most of the frame, with sky round them.
const MARGIN = 1.3;
// The middle of the frame sits no higher than this share of the half frame above the horizon,
// and the top of the bursts no higher than that share below the top edge.
const HORIZON_SHARE = 0.8;
const TOP_SHARE = 0.9;

export interface Still {
  readonly show: Show;
  readonly at: number;
}

export function stillSeed(spot: {
  readonly x: number;
  readonly z: number;
  readonly minute: number;
}) {
  const x = Math.imul(Math.round(spot.x) + 1, 0x85eb_ca6b);
  const z = Math.imul(Math.round(spot.z) + 1, 0xc2b2_ae35);
  return mix(x ^ z ^ Math.imul(spot.minute + 1, 0x27d4_eb2f));
}

// A guest's photo is drawn from where they stood long after their show burnt out, so it gets a
// moment of a show of its own: the same for the same photo, and as full of stars as a few looks find.
export function stillFor(
  sites: readonly LaunchSite[],
  seed: number,
  scratch: StarBuffer = createStarBuffer(),
): Still | null {
  if (sites.length === 0) return null;
  const show = planShow({ tier: 'medium', seed, sites });
  let best: Still | null = null;
  let most = 0;
  for (let look = 0; look < LOOKS; look++) {
    const at = unitOf(mix(seed ^ Math.imul(look + 1, 0x9e37_79b1))) * show.length;
    const stars = brightCount(scratch, writeStars(show, at, scratch));
    if (stars <= most) continue;
    most = stars;
    best = { show, at };
  }
  return best;
}

function brightCount(stars: StarBuffer, count: number): number {
  let bright = 0;
  for (let index = 0; index < count; index++) if (stars.scale[index]! >= BRIGHT) bright++;
  return bright;
}

export interface Aim {
  readonly heading: number;
  readonly tilt: number;
  readonly fov: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// Seeds tried for the busiest part of the sky: enough to land in every burst of a full frame.
const CLUSTER_SEEDS = 64;

// About a burst and its neighbour seen from the beach, so the stars are big in the picture.
const CLUSTER_REACH = 18 * DEGREE;

// The guest turned to the water when the photo was taken, which may be anywhere but the show:
// the picture faces the busiest part of it instead, keeping the horizon in where that fits.
export function aimAt(
  still: Still,
  eye: Point,
  scratch: StarBuffer = createStarBuffer(),
): Aim | null {
  const count = writeStars(still.show, still.at, scratch);
  const seen = directionsOf(scratch, count, eye);
  if (seen.length === 0) return null;
  const widest = (AIM_FOV.max / 2) * DEGREE;
  const kept = busiest(seen, CLUSTER_REACH);
  const middle = middleOf(kept);
  const spread = Math.max(...kept.map((each) => angleBetween(each, middle)));
  const elevation = Math.asin(middle.y);
  const snug = Math.min(widest, Math.max((AIM_FOV.min / 2) * DEGREE, spread * MARGIN));
  const level = Math.min(elevation, snug * HORIZON_SHARE);
  const top = elevation + spread;
  const half = Math.min(widest, Math.max(snug, (top - level) / TOP_SHARE));
  const tilt = Math.max(level, top - half * TOP_SHARE);
  return { heading: Math.atan2(middle.x, middle.z), tilt, fov: (2 * half) / DEGREE };
}

// Unit vectors from the eye, so the busiest part of the sky is measured in angles.
function directionsOf(stars: StarBuffer, count: number, eye: Point): Point[] {
  const seen: Point[] = [];
  for (let index = 0; index < count; index++) {
    if (stars.scale[index]! < BRIGHT) continue;
    const x = stars.x[index]! - eye.x;
    const y = stars.y[index]! - eye.y;
    const z = stars.z[index]! - eye.z;
    const length = Math.hypot(x, y, z);
    if (length > 0) seen.push({ x: x / length, y: y / length, z: z / length });
  }
  return seen;
}

function angleBetween(a: Point, b: Point): number {
  const cos = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

function middleOf(seen: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const each of seen) {
    x += each.x;
    y += each.y;
    z += each.z;
  }
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

// The stars within reach of the one with the most others in reach, tried at evenly spaced stars.
function busiest(seen: readonly Point[], reach: number): readonly Point[] {
  const step = Math.max(1, Math.floor(seen.length / CLUSTER_SEEDS));
  let best: readonly Point[] = [];
  for (let index = 0; index < seen.length; index += step) {
    const near = seen.filter((each) => angleBetween(each, seen[index]!) <= reach);
    if (near.length > best.length) best = near;
  }
  return best;
}
