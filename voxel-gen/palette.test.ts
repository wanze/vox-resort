import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from './models/index.ts';
import { PALETTE } from './palette.ts';
import { PEOPLE_SOURCES } from './people/index.ts';
import { buildModel, type Color } from './voxelgen.ts';

/**
 * Everything that is painted, both registries. The people are drawn from the
 * same palette as the buildings on purpose — a crowd in colours the resort
 * never uses is a crowd that looks pasted on — so they are checked here rather
 * than needing a rule of their own. None of them is exempt: the palette was
 * already in place when they were drawn.
 */
const PAINTED = [...MODEL_SOURCES, ...PEOPLE_SOURCES];

const families = (): [string, [string, Color][]][] =>
  Object.entries(PALETTE).map(([family, ramp]) => [family, Object.entries(ramp)]);

const tones = (): [string, Color][] =>
  families().flatMap(([family, ramp]) =>
    ramp.map(([tone, color]): [string, Color] => [`${family}.${tone}`, color]),
  );

/** How far apart two colours are, summed over the channels. */
const distance = (a: Color, b: Color): number =>
  Math.abs((a >> 16) - (b >> 16)) +
  Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) +
  Math.abs((a & 0xff) - (b & 0xff));

const luminance = (color: Color): number =>
  0.2126 * ((color >> 16) & 0xff) + 0.7152 * ((color >> 8) & 0xff) + 0.0722 * (color & 0xff);

const hex = (color: Color): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * Models drawn before the palette existed, exempt until they have had their
 * style pass. Take an id off this list as its pass lands; the list only ever
 * shrinks, and a model added from now on is checked from its first commit.
 */
const LEGACY = new Set([
  'path',
  'boardwalk',
  'stairs',
  'railing',
  'stair-railing',
  'hedge',
  'street-lamp',
  'flowerbed',
  'palm',
  'pine',
  'cypress',
  'olive',
  'oak',
  'blossom',
  'willow',
  'statue',
  'sun-lounger',
  'beach-umbrella',
  'tikitorch',
  'icecream',
  'entrance',
  'fountain',
  'snack-bar',
  'poolside-bar',
  'resort-bar',
  'spa-pavilion',
  'playground',
  'supermarket',
  'restaurant',
  'beach-club',
  'tennis-court',
  'minigolf',
  'waterpark',
]);

describe('PALETTE', () => {
  it('draws every material as four tones, lightest to deepest', () => {
    for (const [family, ramp] of families()) {
      expect(ramp.map(([tone]) => tone)).toEqual(['light', 'base', 'shade', 'deep']);
      const steps = ramp.map(([, color]) => luminance(color));
      for (let step = 1; step < steps.length; step++) {
        expect(steps[step]!, `${family} tone ${step}`).toBeLessThan(steps[step - 1]!);
      }
    }
  });

  it('keeps the tones of one material far enough apart to tell apart', () => {
    for (const [family, ramp] of families()) {
      for (let i = 0; i < ramp.length; i++) {
        for (let j = i + 1; j < ramp.length; j++) {
          const [toneA, a] = ramp[i]!;
          const [toneB, bColor] = ramp[j]!;
          expect(distance(a, bColor), `${family}.${toneA} vs ${family}.${toneB}`).toBeGreaterThan(
            20,
          );
        }
      }
    }
  });

  it('keeps two materials from becoming the same colour twice', () => {
    // The bug this palette replaced: 137 pairs of colours within 12 of each
    // other, so no two buildings agreed on what cream or terracotta is. Within
    // a ramp closeness is the point; across two materials it is the defect.
    const all = families();
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        for (const [toneA, a] of all[i]![1]) {
          for (const [toneB, bColor] of all[j]![1]) {
            const pair = `${all[i]![0]}.${toneA} vs ${all[j]![0]}.${toneB}`;
            expect(distance(a, bColor), pair).toBeGreaterThan(17);
          }
        }
      }
    }
  });

  it('is small enough to be one art direction', () => {
    const colors = tones().map(([, color]) => color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors.length).toBeLessThan(80);
  });
});

describe('the catalogue paints from the palette', () => {
  const inPalette = new Set(tones().map(([, color]) => color));

  it('lets no model that has had its style pass paint anything else', () => {
    for (const source of PAINTED) {
      if (LEGACY.has(source.id)) continue;
      const strays = new Set<Color>();
      for (const voxel of buildModel(source).voxels) {
        if (!inPalette.has(voxel.color)) strays.add(voxel.color);
      }
      expect([...strays].map(hex), `${source.id} paints outside the palette`).toEqual([]);
    }
  });

  it('has at least one model through its pass', () => {
    expect(PAINTED.some((source) => !LEGACY.has(source.id))).toBe(true);
  });

  it('exempts only models that still exist', () => {
    const ids = new Set(PAINTED.map((source) => source.id));
    for (const id of LEGACY) expect(ids.has(id), `${id} is exempt but gone`).toBe(true);
  });
});
