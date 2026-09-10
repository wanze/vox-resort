/**
 * The palette every model paints from.
 *
 * This is enforced, not advisory: `palette.test.ts` fails a model that paints a
 * colour which is not in here. The reason is style, not tidiness. Authored one
 * file at a time, the catalogue reached 234 distinct colours of which 137 pairs
 * were within a hair of each other, so twelve buildings meant twelve slightly
 * different creams and no two roofs agreed on what terracotta is.
 *
 * The colours are the resort's one art direction, taken from the reference
 * renders in `docs/references/` — the matte Mediterranean lane of them, see
 * `docs/art-direction.md`. A colour here is an **albedo**: flat, unlit, and
 * carrying neither highlight nor shadow, because the scene does the shading and
 * a baked highlight is wrong from the other three sides. The references are lit,
 * so each base below was read off the least shaded large face of its material
 * and taken back to a mid tone.
 *
 * Every material is a four-step {@link Ramp} rather than one colour, and the
 * steps are derived from the base so that all of them lighten and darken by the
 * same amount — which is what makes a wall's trim relate to its wall the way a
 * roof's ridge relates to its tile. Reach for a step when a part is genuinely
 * a different material: a kerb against paving, an eave course against roof
 * tile, a shutter against stucco. Never to fake a light or a shadow.
 */

import type { Color } from './voxelgen.ts';

/** One material, as the four tones a model may draw it in. */
export interface Ramp {
  /** Lighter: trim, quoins, a sill, a ridge cap. */
  readonly light: Color;
  /** The material itself. Most of a model is this. */
  readonly base: Color;
  /** Darker: a kerb, an eave course, a plinth lip. */
  readonly shade: Color;
  /** Darkest: a recess, a door leaf, wet timber. */
  readonly deep: Color;
}

const channel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));

const pack = (r: number, g: number, b: number): Color =>
  (channel(r) << 16) | (channel(g) << 8) | channel(b);

/** Scales towards black, which keeps the hue and drops the value. */
const darker = (color: Color, factor: number): Color =>
  pack(((color >> 16) & 0xff) * factor, ((color >> 8) & 0xff) * factor, (color & 0xff) * factor);

/** Mixes towards white, which keeps the hue and drops the saturation. */
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

/**
 * A family whose four tones are picked rather than derived.
 *
 * Only for a material whose steps are genuinely four different things — see
 * {@link PALETTE.skin}, the one that is. Everything else takes {@link ramp}, so
 * that its steps relate to each other the way every other material's do.
 */
const chosen = (light: Color, base: Color, shade: Color, deep: Color): Ramp => ({
  light,
  base,
  shade,
  deep,
});

/**
 * Every material in the resort.
 *
 * Adding a family is a deliberate act: each one is a new set of four DVE voxels
 * and four rendered materials, and one more thing for a model to look unlike its
 * neighbours in. Prefer a step of an existing ramp.
 */
export const PALETTE = {
  /** Whitewashed render: the walls of every building in the lane. */
  stucco: ramp(0xe8dcc6),
  /** Roof tile, and the pots the plants stand in. */
  terracotta: ramp(0xc46a42),
  /** Structural timber: decking, posts, shutters, railings. */
  teak: ramp(0x8a5f36),
  /** Dried palm: the roofs of the bungalows and the beach bars. */
  thatch: ramp(0xc9a05a),
  /** The beach, and the sand a boardwalk is laid over. */
  sand: ramp(0xdcbe95),
  /** Cut stone: paving, plinths, kerbs, steps, plazas. */
  stone: ramp(0xcfc3b8),
  /** Grey stone and rendered concrete: utility blocks, flat roofs. */
  slate: ramp(0x9aa0a3),
  /** Mown lawn and the playing surfaces cut into it. */
  grass: ramp(0x7d9a3c),
  /** Planting: hedges, palm fronds, potted greenery. */
  foliage: ramp(0x4f7f3a),
  /** Glazing. Dark enough to read as a hole in a wall, not as a mirror. */
  glass: ramp(0x8fb8c4),
  /** Ironwork: gates, railings, fence posts, fittings. */
  metal: ramp(0x474d57),
  /**
   * Pool water.
   *
   * Brighter and bluer than the sea, which does not paint from here at all:
   * `seaMaterial.ts` grades its own sandbank green through turquoise to a deep
   * blue off the shore distances its geometry carries. A pool has no shore and
   * no depth to grade, so what it has instead is this — a metre of clear water
   * over pale tile, which really is a lighter, cleaner blue than an ocean.
   *
   * Read as an albedo by `poolWaterMaterial.ts`, which shades it with the sea's
   * own swell and glint, so the difference between the two bodies of water is
   * this colour and nothing else.
   */
  water: ramp(0x4fc6de),
  /** Blossom red, for flower beds and awnings. */
  bloom: ramp(0xd2483c),
  /** Blossom yellow, and the canvas of a parasol. */
  amber: ramp(0xe8a33c),
  /**
   * The people who walk the plot. The one family whose four steps are four
   * *people* rather than four parts of one thing, which is why they are chosen
   * rather than derived from a base: a complexion runs far wider than the
   * lighten-and-darken a {@link ramp} applies, and four tones of one skin would
   * be one person under four lights instead of four people.
   *
   * It is also the only family a crowd needs. Everything a person wears comes
   * from the families above — a stucco shirt, teak or slate trousers, bloom and
   * amber and water for the rest — because a crowd dressed in colours the
   * buildings never use is a crowd that looks pasted onto the resort. Skin is
   * simply the one thing a palette built for buildings has no answer for.
   */
  skin: chosen(0xf6c4b0, 0xd9a173, 0xa9704a, 0x6b4034),
} as const;
