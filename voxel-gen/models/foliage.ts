/**
 * Shared building blocks for the tree models.
 *
 * Trees are the one family of objects where the same three gestures (stand a
 * plinth, grow a tapering limb, blow a crown of leaves around a point) recur in
 * every file, and where hand-placing the leaves would be thousands of `set`
 * calls per species. So the gestures live here and each tree file is a recipe
 * of them, which is also what makes a species cheap to try, judge and throw
 * away.
 *
 * Everything is deterministic: the irregularity comes from a hash of the
 * coordinate, not from `Math.random`, so a model is the same art on every run.
 */
import type { Color, VoxelBuilder } from '../voxelgen.ts';

/** The plinth colours every planted object in the catalogue stands on. */
const GROUND = {
  base: 0xcdb98f,
  baseDark: 0xb5a274,
  soil: 0x6f5636,
} as const;

/** Bark. Two browns shared with the palm, plus the grey of an old olive. */
export const BARK = {
  brown: 0x8a6a3f,
  brownDark: 0x6f5330,
  grey: 0x9c917c,
} as const;

/**
 * The catalogue's greens, dark to light. A crown reads as one mass shaded by
 * the app's own light, so a species varies by which slice of this it uses, not
 * by inventing shades of its own.
 */
export const LEAF = {
  darkest: 0x2f7d45,
  dark: 0x3f8a48,
  mid: 0x49a05e,
  light: 0x62b56f,
} as const;

/** Deterministic 0..1 hash of a coordinate; `salt` gives one blob its own grain. */
export function noise(x: number, y: number, z: number, salt: number): number {
  let h =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 1013904223) +
    Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The low square plate and darker lip a planted object sits on, `n` voxels to a
 * side. It runs to the edge of the footprint so a tree fills the tiles it claims
 * as required by the fill rule in the README.
 */
export function plinth(b: VoxelBuilder, n: number): void {
  b.box(0, n, 0, 1, 0, n, GROUND.base);
  for (let i = 0; i <= n; i++) {
    b.set(i, 1, 0, GROUND.baseDark);
    b.set(i, 1, n, GROUND.baseDark);
    b.set(0, 1, i, GROUND.baseDark);
    b.set(n, 1, i, GROUND.baseDark);
  }
}

/** An inset bed of bare earth in the plinth, for the trunk to come out of. */
export function bed(b: VoxelBuilder, x0: number, x1: number, z0: number, z1: number): void {
  b.box(x0, x1, 1, 1, z0, z1, GROUND.soil);
}

export interface CrownOptions {
  /** Leaf colours, dark to light: the top and the outside catch the lighter ones. */
  readonly palette: readonly Color[];
  /** Footprint edge; nothing is painted outside `0..limit` in x and z. */
  readonly limit: number;
  /** How far the surface wanders off the ellipsoid, 0..1. */
  readonly rough?: number;
  /** Varies the grain, so two blobs of the same size are not the same blob. */
  readonly salt?: number;
  /** Lowest layer the crown may reach; a flat-bottomed canopy sets this high. */
  readonly floor?: number;
  /** Fraction of the outer shell left open, to let sky through the leaves. */
  readonly gap?: number;
}

/**
 * Blows a rough ellipsoid of leaves around a point. Crowns are meant to be
 * stacked: a species is a handful of these overlapping, which is what gives a
 * silhouette its lumps without any of them being drawn by hand.
 */
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
  /** Bark colours; the second is speckled in to break up the first. */
  readonly colors: readonly [Color, Color];
  /** Footprint edge; nothing is painted outside `0..limit` in x and z. */
  readonly limit: number;
  /** Lowest layer the limb may reach; defaults to the top of the plinth. */
  readonly floor?: number;
}

/**
 * A tapering round limb from one point to another: the trunk, and every bough
 * off it. Drawn as overlapping balls along the line, which is enough: a branch
 * is three voxels thick and nobody reads its cross-section.
 */
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
