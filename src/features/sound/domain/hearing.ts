import type { SoundKind } from '../../../../voxel-gen/voxelgen.ts';
import type { Show } from '../../fireworks/domain/show';
import { SIGN_MIN_TILE_PX } from '../../hud/domain/signs';
import type { Weather } from '../../sim/domain/weather';
import { NATURE_SLOTS, SOUND_KINDS, VENUE_SLOTS, type SlotName } from './bank';

export interface HeardScene {
  // CSS pixels per tile at the camera's target.
  tilePx: number;
  targetX: number;
  targetZ: number;
  // skyStateFor(time).lampFactor: 0 by day, 1 at night.
  night: number;
  weather: Weather;
  // The clock's real seconds, which the lightning flashes by.
  stormSeconds: number;
  // The fireworks show with launches left, and its playhead.
  show: Show | null;
  showSeconds: number;
  // Tiles to the nearest water, or Infinity beyond SURF_REACH.
  shore: number;
  // Of the guests on the plot, the share awake; 1 with nobody here.
  awake: number;
  guests: number;
  children: number;
  // Guests standing on water tiles.
  swimmers: number;
  // Per SoundKind, in SOUND_KINDS order: the summed closeness of sources in reach, 0..∞.
  near: Float32Array;
  // Per SoundKind: the closeness-weighted share of those that are open, 0..1.
  open: Float32Array;
}

export const LAYERS = [
  'rain',
  'wind',
  'surf',
  ...NATURE_SLOTS,
  ...VENUE_SLOTS,
  'fountain',
  'torch',
] as const satisfies readonly SlotName[];

export type Layer = (typeof LAYERS)[number];

const LAYER_INDEX = new Map<Layer, number>(LAYERS.map((layer, at) => [layer, at]));
const KIND_INDEX = new Map<SoundKind, number>(SOUND_KINDS.map((kind, at) => [kind, at]));

const layerAt = (layer: Layer): number => LAYER_INDEX.get(layer)!;
export const kindAt = (kind: SoundKind): number => KIND_INDEX.get(kind)!;

// A building is heard when its sign appears, so what the player reads and hears agree.
const CLOSE_TILE_PX = SIGN_MIN_TILE_PX;
const FAR_TILE_PX = 6;
const FAR_RADIUS = 24;
const CLOSE_RADIUS = 8;
// Further than any hearing radius: the sea is heard faintly from anywhere near the beach.
export const SURF_REACH = 40;
const SURF_FLOOR = 0.15;
export const MAX_VENUE_VOICES = 3;

const smoothstep = (from: number, to: number, value: number): number => {
  const through = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return through * through * (3 - 2 * through);
};

const zoomOf = (tilePx: number): number => smoothstep(FAR_TILE_PX, CLOSE_TILE_PX, tilePx);

export function hearingRadius(tilePx: number): number {
  const zoom = zoomOf(tilePx);
  return FAR_RADIUS + (CLOSE_RADIUS - FAR_RADIUS) * zoom;
}

export function closeness(distanceTiles: number, radius: number): number {
  if (distanceTiles >= radius) return 0;
  const left = 1 - Math.max(0, distanceTiles) / radius;
  return left * left;
}

// A show over the sea takes the music down further than a storm does.
export function musicDuck(weather: Weather, showing = false): number {
  if (showing) return 0.5;
  return weather === 'storm' ? 0.6 : 1;
}

const RAIN: { readonly [weather in Weather]: number } = {
  clear: 0,
  rain: 0.55,
  storm: 1,
  heatwave: 0,
};

const WIND: { readonly [weather in Weather]: number } = {
  clear: 0.06,
  rain: 0.25,
  storm: 1,
  heatwave: 0.06,
};

const isWet = (weather: Weather): boolean => weather === 'rain' || weather === 'storm';

function surfOf(scene: HeardScene, radius: number): number {
  if (!Number.isFinite(scene.shore)) return 0;
  const near = closeness(scene.shore, radius) * (scene.weather === 'storm' ? 1 : 0.8);
  return Math.max(SURF_FLOOR, near);
}

function hearNature(scene: HeardScene, into: Float32Array, surf: number): void {
  const day = 1 - scene.night;
  const dry = isWet(scene.weather) ? 0 : 1;
  const crowded = isWet(scene.weather) ? 0.4 : 1;
  const trees = Math.min(1, scene.near[kindAt('trees')]! / 4);
  into[layerAt('gulls')] = surf * day * dry * 0.6;
  into[layerAt('birds')] = trees * day * dry;
  into[layerAt('crickets')] = trees * scene.night * dry;
  into[layerAt('cicadas')] = trees * day * (scene.weather === 'heatwave' ? 1 : 0);
  into[layerAt('crowd')] = Math.min(1, scene.guests / 40) * crowded;
  into[layerAt('children')] = Math.min(1, scene.children / 8) * crowded;
  into[layerAt('swimmers')] = Math.min(1, scene.swimmers / 10);
  into[layerAt('fountain')] = Math.min(1, scene.near[kindAt('fountain')]!);
  into[layerAt('torch')] = Math.min(1, scene.near[kindAt('torch')]!) * scene.night;
}

const VENUE_LAYERS = VENUE_SLOTS.map((venue) => ({ layer: layerAt(venue), kind: kindAt(venue) }));

function loudestLeft(into: Float32Array, kept: ReadonlySet<number>): number {
  let loudest = -1;
  for (const { layer } of VENUE_LAYERS) {
    const louder = loudest < 0 || into[layer]! > into[loudest]!;
    if (!kept.has(layer) && into[layer]! > 0 && louder) loudest = layer;
  }
  return loudest;
}

// Only the loudest few: a street of six venues heard at once is a din, not a place.
function hearVenues(scene: HeardScene, into: Float32Array, gate: number): void {
  for (const { layer, kind } of VENUE_LAYERS) {
    into[layer] = Math.min(1, scene.near[kind]!) * scene.open[kind]! * gate;
  }
  const kept = new Set<number>();
  for (let loudest = loudestLeft(into, kept); loudest >= 0 && kept.size < MAX_VENUE_VOICES;) {
    kept.add(loudest);
    loudest = loudestLeft(into, kept);
  }
  for (const { layer } of VENUE_LAYERS) if (!kept.has(layer)) into[layer] = 0;
}

// A target level per layer, in LAYERS order, 0..1.
export function hear(scene: HeardScene, into: Float32Array): void {
  const zoom = zoomOf(scene.tilePx);
  const radius = hearingRadius(scene.tilePx);
  const surf = surfOf(scene, radius);
  into[layerAt('rain')] = RAIN[scene.weather];
  into[layerAt('wind')] = WIND[scene.weather];
  into[layerAt('surf')] = surf;
  hearNature(scene, into, surf);
  // A recording of a busy bar is wrong once the resort has gone to bed, though the bar is still open.
  hearVenues(scene, into, smoothstep(0.55, 0.85, zoom) * scene.awake);
}

// Exponential, so a level set at 5 Hz glides there without overshooting.
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return target + (current - target) * Math.exp(-dt / tau);
}
