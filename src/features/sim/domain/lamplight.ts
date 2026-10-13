import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { SUNRISE_TIME, SUNSET_TIME } from '../../lighting/domain/dayNight';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { flowFieldFor } from './flowField';
import { TICKS_PER_DAY } from './simClock';

// A light as it stands on the plot: x/z in world voxels, distance in voxels as the model gives it.
export interface Glow {
  readonly x: number;
  readonly z: number;
  readonly intensity: number;
  readonly distance: number;
}

export interface LightField {
  readonly tilesX: number;
  readonly tilesZ: number;
  // 0 dark, 1 lit; row-major, tileZ * tilesX + tileX.
  readonly value: Float32Array;
}

// The street lamp's: a brighter light reassures further, a lantern on a bakery less.
const LAMP_INTENSITY = 90;

// Two tiles from a street lamp, diagonals included, still reads as lit.
const LIT_ENOUGH = 0.25;

// Nobody minds a few dark steps between two lights: unease starts this many tiles from the nearest
// one and is full a few tiles on, so a lamp every dozen tiles keeps a path calm.
export const CALM_TILES = 4;
const UNEASY_TILES = 4;

// Deep in the dark at midnight. About a good show's lift the other way, so a resort that leaves
// its guests in the dark loses what an evening's entertainment wins.
export const DARK_UNEASE = 0.15;

// Half an hour either side of the horizon, as the lamps come up in the sky.
const TWILIGHT_TICKS = 30;

const SUNSET_TICK = SUNSET_TIME * TICKS_PER_DAY;
const SUNRISE_TICK = SUNRISE_TIME * TICKS_PER_DAY;

// Squared falloff rather than linear: a lamp lights the ground under it evenly and fades at the rim.
function shine(sum: Float32Array, glow: Glow, tilesX: number, tilesZ: number): void {
  const reach = glow.distance;
  if (!(reach > 0) || !(glow.intensity > 0)) return;
  const strength = glow.intensity / LAMP_INTENSITY;
  const x0 = Math.max(0, Math.floor((glow.x - reach) / TILE_VOXELS));
  const x1 = Math.min(tilesX - 1, Math.floor((glow.x + reach) / TILE_VOXELS));
  const z0 = Math.max(0, Math.floor((glow.z - reach) / TILE_VOXELS));
  const z1 = Math.min(tilesZ - 1, Math.floor((glow.z + reach) / TILE_VOXELS));
  const reachSquared = reach * reach;
  for (let z = z0; z <= z1; z++) {
    const dz = (z + 0.5) * TILE_VOXELS - glow.z;
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5) * TILE_VOXELS - glow.x;
      const near = 1 - (dx * dx + dz * dz) / reachSquared;
      if (near > 0) sum[z * tilesX + x]! += strength * near;
    }
  }
}

export function lightFieldFor(glows: readonly Glow[], tilesX: number, tilesZ: number): LightField {
  const value = new Float32Array(tilesX * tilesZ);
  for (const glow of glows) shine(value, glow, tilesX, tilesZ);
  for (let tile = 0; tile < value.length; tile++) {
    value[tile] = Math.min(1, value[tile]! / LIT_ENOUGH);
  }
  return { tilesX, tilesZ, value };
}

export function litAt(field: LightField, tileX: number, tileZ: number): number {
  if (tileX < 0 || tileZ < 0 || tileX >= field.tilesX || tileZ >= field.tilesZ) return 0;
  return field.value[tileZ * field.tilesX + tileX]!;
}

const rise = (tick: number, at: number): number =>
  Math.min(1, Math.max(0, (tick - at + TWILIGHT_TICKS) / (2 * TWILIGHT_TICKS)));

// 0 by day, 1 at night, ramping through the twilight. From the sim clock, never the sky, so a
// headless run and a loaded save feel the same night.
export function darknessAt(tickOfDay: number): number {
  const tick = ((tickOfDay % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  return Math.max(rise(tick, SUNSET_TICK), 1 - rise(tick, SUNRISE_TICK));
}

// Per node, 0 within CALM_TILES of a light and 1 deep in a dark stretch. Walked along the paths, not
// measured across the grass: a lamp behind a hedge lights nobody's way. A node no light reaches is
// as dark as it gets.
export function unlitStretchOf(network: WalkNetwork, light: LightField): Float32Array {
  const lit: number[] = [];
  network.nodes.forEach((node, at) => {
    if (litAt(light, node.tileX, node.tileZ) >= 1) lit.push(at);
  });
  const { hops } = flowFieldFor(network, lit);
  return Float32Array.from(hops, (hop) =>
    hop < 0 ? 1 : Math.min(1, Math.max(0, (hop - CALM_TILES) / UNEASY_TILES)),
  );
}

// How uneasy a node feels right now: 0 by day or near a light, 1 deep in the dark at midnight.
export const gloomAt = (unlit: Float32Array, node: number, darkness: number): number =>
  darkness <= 0 || node < 0 ? 0 : darkness * (unlit[node] ?? 0);
