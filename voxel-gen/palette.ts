import type { Color } from './voxelgen.ts';

export interface Ramp {
  readonly light: Color;
  readonly base: Color;
  readonly shade: Color;
  readonly deep: Color;
}

const channel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

const pack = (r: number, g: number, b: number): Color =>
  (channel(r) << 16) | (channel(g) << 8) | channel(b);

const darker = (color: Color, factor: number): Color =>
  pack(((color >> 16) & 0xff) * factor, ((color >> 8) & 0xff) * factor, (color & 0xff) * factor);

const lighter = (color: Color, amount: number): Color => {
  const mix = (value: number): number => value + (255 - value) * amount;
  return pack(mix((color >> 16) & 0xff), mix((color >> 8) & 0xff), mix(color & 0xff));
};

const ramp = (base: Color): Ramp => ({
  light: lighter(base, 0.22),
  base,
  shade: darker(base, 0.8),
  deep: darker(base, 0.62),
});

// Only for a family whose steps are four different things, like skin; everything
// else takes `ramp` so its steps relate like every other material's.
const chosen = (light: Color, base: Color, shade: Color, deep: Color): Ramp => ({
  light,
  base,
  shade,
  deep,
});

// Enforced by `palette.test.ts`. Colours are albedos with no baked highlight or
// shadow, because the scene does the shading. Each family costs four DVE voxels
// and four materials; prefer a step of an existing ramp.
export const PALETTE = {
  stucco: ramp(0xe8dcc6),
  terracotta: ramp(0xc46a42),
  teak: ramp(0x8a5f36),
  thatch: ramp(0xc9a05a),
  sand: ramp(0xdcbe95),
  stone: ramp(0xcfc3b8),
  slate: ramp(0x9aa0a3),
  grass: ramp(0x7d9a3c),
  foliage: ramp(0x4f7f3a),
  // Dark enough to read as a hole in a wall, not as a mirror.
  glass: ramp(0x8fb8c4),
  metal: ramp(0x474d57),
  // Brighter than the sea, which grades its own colour in `seaMaterial.ts`.
  water: ramp(0x4fc6de),
  bloom: ramp(0xd2483c),
  amber: ramp(0xe8a33c),
  // Chosen rather than derived: four tones of one skin would be one person under four lights.
  skin: chosen(0xf6c4b0, 0xd9a173, 0xa9704a, 0x6b4034),
} as const;
