import { fnv, unitAt } from '../../random/domain/hash';

// World voxels: the rectangle a building stands on, and the ground it stands at.
export interface DustFootprint {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly y: number;
}

export interface Puff extends DustFootprint {
  readonly seed: number;
  age: number;
}

export const PUFF_SECONDS = 1.1;
const GRAINS = 28;
export const MAX_PUFFS = 4;
export const MAX_GRAINS = MAX_PUFFS * GRAINS;

const DRIFT = 5;
const RISE = 4;
const EDGE = 2.6;

// Each grain sets off a little after the last, so the cloud rolls out rather than popping.
const STAGGER = 0.3;

export interface DustBuffer {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly scale: Float32Array;
}

export function createDustBuffer(): DustBuffer {
  const column = (): Float32Array => new Float32Array(MAX_GRAINS);
  return { x: column(), y: column(), z: column(), scale: column() };
}

export const puffOf = (footprint: DustFootprint, key: string): Puff => ({
  ...footprint,
  seed: fnv(key),
  age: 0,
});

// The newest are kept: a row of cottages finishing together still shows the last one's cloud.
export function stirDust(puffs: Puff[], puff: Puff): void {
  puffs.push(puff);
  if (puffs.length > MAX_PUFFS) puffs.splice(0, puffs.length - MAX_PUFFS);
}

export function settleDust(puffs: Puff[], seconds: number): void {
  for (const puff of puffs) puff.age += Math.max(seconds, 0);
  const settled = puffs.filter((puff) => puff.age >= PUFF_SECONDS);
  for (const puff of settled) puffs.splice(puffs.indexOf(puff), 1);
}

// A point on the footprint's edge, walked round from its corner, and the way out from there.
function edgeAt(puff: Puff, along: number): [number, number, number, number] {
  const { x, z, width, depth } = puff;
  if (along < width) return [x + along, z, 0, -1];
  if (along < width + depth) return [x + width, z + along - width, 1, 0];
  if (along < 2 * width + depth) return [x + width - (along - width - depth), z + depth, 0, 1];
  return [x, z + depth - (along - 2 * width - depth), -1, 0];
}

export function writeDust(puffs: readonly Puff[], out: DustBuffer): number {
  let count = 0;
  for (const puff of puffs.slice(-MAX_PUFFS)) {
    const perimeter = 2 * (puff.width + puff.depth);
    const life = puff.age / PUFF_SECONDS;
    for (let grain = 0; grain < GRAINS; grain++) {
      const start = unitAt(puff.seed, 4 * grain) * STAGGER;
      const at = Math.min(Math.max((life - start) / (1 - start), 0), 1);
      const [edgeX, edgeZ, outX, outZ] = edgeAt(puff, unitAt(puff.seed, 4 * grain + 1) * perimeter);
      const reach = DRIFT * (1 - (1 - at) ** 2) * (0.5 + unitAt(puff.seed, 4 * grain + 2));
      const size = 0.6 + 0.4 * unitAt(puff.seed, 4 * grain + 3);
      out.x[count] = edgeX + outX * reach;
      out.z[count] = edgeZ + outZ * reach;
      out.y[count] = puff.y + 0.5 + RISE * at * size;
      out.scale[count] = EDGE * size * Math.sin(Math.PI * at);
      count++;
    }
  }
  return count;
}
