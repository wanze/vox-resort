export type ShellKind = 'peony' | 'willow' | 'crackle' | 'ring';

export const STARS: { readonly [kind in ShellKind]: number } = {
  peony: 48,
  willow: 40,
  crackle: 30,
  ring: 36,
};

export const LIFE_SECONDS: { readonly [kind in ShellKind]: number } = {
  peony: 1.8,
  willow: 3.2,
  crackle: 1.4,
  ring: 1.6,
};

// How fast a star loses the burst's push, per second; a willow is slowed hard and left to droop.
export const DRAG: { readonly [kind in ShellKind]: number } = {
  peony: 2.4,
  willow: 3.4,
  crackle: 2.8,
  ring: 2.6,
};

// Voxels a second squared, far below real gravity: a burning star is held up by its own drag.
export const GRAVITY: { readonly [kind in ShellKind]: number } = {
  peony: 9,
  willow: 15,
  crackle: 10,
  ring: 8,
};

export const SPARKS = 24;
export const SPARKS_FROM = 0.6;
export const SPARKS_SPREAD = 0.6;
export const SPARK_LIFE = 0.45;

export const MAX_RISE = 2.2;

export const LONGEST_LIFE = Math.max(
  ...Object.values(LIFE_SECONDS),
  SPARKS_FROM + SPARKS_SPREAD + SPARK_LIFE,
);

export function lifeOf(kind: ShellKind): number {
  return kind === 'crackle'
    ? Math.max(LIFE_SECONDS.crackle, SPARKS_FROM + SPARKS_SPREAD + SPARK_LIFE)
    : LIFE_SECONDS[kind];
}
