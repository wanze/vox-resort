import type { Color, VoxelBuilder } from '../voxelgen.ts';

const GROUND = {
  base: 0xcdb98f,
  baseDark: 0xb5a274,
  soil: 0x6f5636,
} as const;

export const BARK = {
  brown: 0x8a6a3f,
  brownDark: 0x6f5330,
  grey: 0x9c917c,
} as const;

export const LEAF = {
  darkest: 0x2f7d45,
  dark: 0x3f8a48,
  mid: 0x49a05e,
  light: 0x62b56f,
} as const;

// A coordinate hash rather than Math.random, so a model is the same art on every run.
export function noise(x: number, y: number, z: number, salt: number): number {
  let h =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 1013904223) +
    Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Runs to the edge of the footprint, as the README's fill rule requires.
export function plinth(b: VoxelBuilder, n: number): void {
  b.box(0, n, 0, 1, 0, n, GROUND.base);
  for (let i = 0; i <= n; i++) {
    b.set(i, 1, 0, GROUND.baseDark);
    b.set(i, 1, n, GROUND.baseDark);
    b.set(0, 1, i, GROUND.baseDark);
    b.set(n, 1, i, GROUND.baseDark);
  }
}

export function bed(b: VoxelBuilder, x0: number, x1: number, z0: number, z1: number): void {
  b.box(x0, x1, 1, 1, z0, z1, GROUND.soil);
}

export interface CrownOptions {
  readonly palette: readonly Color[];
  readonly limit: number;
  readonly rough?: number;
  readonly salt?: number;
  readonly floor?: number;
  readonly gap?: number;
}

export function crown(
  b: VoxelBuilder,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  options: CrownOptions,
): void {
  const { palette, limit } = options;
  const rough = options.rough ?? 0.35;
  const salt = options.salt ?? 0;
  const floor = options.floor ?? 2;
  const gap = options.gap ?? 0;

  for (let y = Math.max(floor, Math.ceil(cy - ry)); y <= Math.floor(cy + ry); y++) {
    for (let z = Math.max(0, Math.ceil(cz - rz)); z <= Math.min(limit, Math.floor(cz + rz)); z++) {
      for (
        let x = Math.max(0, Math.ceil(cx - rx));
        x <= Math.min(limit, Math.floor(cx + rx));
        x++
      ) {
        const grain = noise(x, y, z, salt);
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d > 1 + (grain - 0.5) * rough) continue;
        if (gap > 0 && d > 0.5 && noise(x, y, z, salt + 17) < gap) continue;
        const lift = (y - (cy - ry)) / (2 * ry);
        const shade = Math.floor((lift * 0.7 + grain * 0.6) * palette.length);
        b.set(x, y, z, palette[Math.min(palette.length - 1, Math.max(0, shade))]!);
      }
    }
  }
}

export interface LimbOptions {
  readonly colors: readonly [Color, Color];
  readonly limit: number;
  readonly floor?: number;
}

export function limb(
  b: VoxelBuilder,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  r0: number,
  r1: number,
  options: LimbOptions,
): void {
  const { colors, limit } = options;
  const floor = options.floor ?? 2;
  const span = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const steps = Math.max(1, Math.round(span * 2));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = from[0] + (to[0] - from[0]) * t;
    const cy = from[1] + (to[1] - from[1]) * t;
    const cz = from[2] + (to[2] - from[2]) * t;
    const r = r0 + (r1 - r0) * t;
    const k = Math.ceil(r);
    for (let dy = -k; dy <= k; dy++) {
      for (let dz = -k; dz <= k; dz++) {
        for (let dx = -k; dx <= k; dx++) {
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          const x = Math.round(cx) + dx;
          const y = Math.round(cy) + dy;
          const z = Math.round(cz) + dz;
          if (y < floor || x < 0 || x > limit || z < 0 || z > limit) continue;
          b.set(x, y, z, noise(x, y, z, 91) < 0.26 ? colors[1] : colors[0]);
        }
      }
    }
  }
}
