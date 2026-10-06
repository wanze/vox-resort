import { describe, expect, it } from 'vitest';
import {
  BED,
  createFlameBuffer,
  FLAMES_PER_FIRE,
  HEIGHT,
  kindle,
  MAX_FIRES,
  relit,
  SPARK_HEIGHT,
  strengthAfter,
  tend,
  writeFlames,
  type Burning,
  type Fire,
} from './flames';

const FIRE: Fire = { x: 100, y: 4, z: 60, strength: 1 };

const flamesOf = (fires: readonly Fire[], seconds: number) => {
  const out = createFlameBuffer();
  const count = writeFlames(fires, seconds, out);
  return { out, count };
};

describe('writeFlames', () => {
  it('draws the same places for every fire, and no more fires than it has room for', () => {
    expect(flamesOf([FIRE], 0).count).toBe(FLAMES_PER_FIRE);
    expect(flamesOf([], 0).count).toBe(0);
    const many = Array.from({ length: MAX_FIRES + 2 }, (_, at) => ({ ...FIRE, x: 40 * at }));
    expect(flamesOf(many, 0).count).toBe(MAX_FIRES * FLAMES_PER_FIRE);
  });

  it('keeps the flames over the bed and the sparks under their ceiling', () => {
    for (const seconds of [0, 0.37, 2.5, 61.2]) {
      const { out, count } = flamesOf([FIRE], seconds);
      for (let at = 0; at < count; at++) {
        expect(Math.hypot(out.x[at]! - FIRE.x, out.z[at]! - FIRE.z)).toBeLessThanOrEqual(BED);
        expect(out.y[at]).toBeGreaterThanOrEqual(FIRE.y);
        expect(out.y[at]).toBeLessThanOrEqual(FIRE.y + SPARK_HEIGHT);
      }
    }
  });

  it('flickers from one moment to the next, and says the same of the same moment', () => {
    const now = flamesOf([FIRE], 3).out;
    expect(flamesOf([FIRE], 3).out).toEqual(now);
    expect(flamesOf([FIRE], 3.1).out.y).not.toEqual(now.y);
  });

  it('draws nothing of a fire that is out, and a low fire while it catches', () => {
    const out = flamesOf([{ ...FIRE, strength: 0 }], 1).out;
    expect([...out.scale.subarray(0, FLAMES_PER_FIRE)].every((edge) => edge === 0)).toBe(true);
    const catching = flamesOf([{ ...FIRE, strength: 0.25 }], 1).out;
    const tallest = Math.max(...catching.y.subarray(0, FLAMES_PER_FIRE));
    expect(tallest - FIRE.y).toBeLessThanOrEqual(0.25 * Math.max(HEIGHT, SPARK_HEIGHT));
  });

  it('burns yellow at the bottom and red at the top', () => {
    const { out } = flamesOf([FIRE], 5);
    const tongues = Array.from({ length: FLAMES_PER_FIRE - 4 }, (_, at) => at).toSorted(
      (a, b) => out.y[a]! - out.y[b]!,
    );
    const low = tongues[0]!;
    const high = tongues.at(-1)!;
    expect(out.g[low]!).toBeGreaterThan(out.g[high]!);
  });
});

describe('strengthAfter', () => {
  it('catches and burns down over a few seconds, never past full or out', () => {
    expect(strengthAfter(0, true, 1)).toBeGreaterThan(0);
    expect(strengthAfter(0, true, 1)).toBeLessThan(1);
    expect(strengthAfter(0.9, true, 60)).toBe(1);
    expect(strengthAfter(1, false, 1)).toBeLessThan(1);
    expect(strengthAfter(0.1, false, 60)).toBe(0);
    expect(strengthAfter(0.5, true, -3)).toBe(0.5);
  });
});

describe('kindle and tend', () => {
  const hearth = { key: 'fire-pit#0:fire', x: 1, y: 2, z: 3 };

  it('catches a new fire, burns it down once left out, and forgets it when it is out', () => {
    const fires = new Map<string, Burning>();
    const drawn: Burning[] = [];
    kindle(fires, [hearth]);
    tend(fires, 2, drawn);
    expect(drawn).toHaveLength(1);
    const caught = drawn[0]!.strength;
    expect(caught).toBeGreaterThan(0);
    kindle(fires, []);
    tend(fires, 1, drawn);
    expect(drawn[0]!.strength).toBeLessThan(caught);
    tend(fires, 60, drawn);
    expect(drawn).toEqual([]);
    expect(fires.size).toBe(0);
  });

  it('keeps a fire lit again before it went out where it had burnt down to', () => {
    const fires = new Map<string, Burning>();
    kindle(fires, [hearth]);
    tend(fires, 2, []);
    kindle(fires, []);
    tend(fires, 1, []);
    const low = fires.get(hearth.key)!.strength;
    kindle(fires, [hearth]);
    expect(fires.get(hearth.key)!.strength).toBe(low);
  });
});

describe('relit', () => {
  it('puts out what is no longer burning and lights only what was not', () => {
    const fires = [{ key: 'b' }, { key: 'c' }];
    expect(relit(new Set(['a', 'b']), fires)).toEqual({ out: ['a'], lit: [{ key: 'c' }] });
    expect(relit(new Set(['b', 'c']), fires)).toEqual({ out: [], lit: [] });
  });
});
