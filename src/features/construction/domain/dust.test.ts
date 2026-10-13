import { describe, expect, it } from 'vitest';
import {
  createDustBuffer,
  MAX_GRAINS,
  MAX_PUFFS,
  PUFF_SECONDS,
  puffOf,
  settleDust,
  stirDust,
  writeDust,
  type Puff,
} from './dust';

const FOOTPRINT = { x: 32, z: 16, width: 16, depth: 24, y: 8 };

const agedTo = (seconds: number): Puff => ({ ...puffOf(FOOTPRINT, 'hotel#1'), age: seconds });

describe('stirDust', () => {
  it('keeps only the newest clouds', () => {
    const puffs: Puff[] = [];
    for (let each = 0; each < MAX_PUFFS + 2; each++) {
      stirDust(puffs, puffOf(FOOTPRINT, `cottage#${each}`));
    }
    expect(puffs).toHaveLength(MAX_PUFFS);
    expect(puffs.at(-1)?.seed).toBe(puffOf(FOOTPRINT, `cottage#${MAX_PUFFS + 1}`).seed);
  });
});

describe('settleDust', () => {
  it('ages the clouds and forgets those that have settled', () => {
    const puffs = [agedTo(0), agedTo(PUFF_SECONDS - 0.1)];
    settleDust(puffs, 0.2);
    expect(puffs).toHaveLength(1);
    expect(puffs[0]?.age).toBeCloseTo(0.2);
  });

  it('does not run backwards', () => {
    const puffs = [agedTo(0.5)];
    settleDust(puffs, -3);
    expect(puffs[0]?.age).toBe(0.5);
  });
});

describe('writeDust', () => {
  it('draws nothing with no cloud', () => {
    expect(writeDust([], createDustBuffer())).toBe(0);
  });

  it('starts every grain at no size, so a cloud never pops in', () => {
    const out = createDustBuffer();
    const count = writeDust([agedTo(0)], out);
    expect(count).toBeGreaterThan(0);
    expect(Math.max(...out.scale.slice(0, count))).toBe(0);
  });

  it('rolls out from the footprint and stays near the ground', () => {
    const out = createDustBuffer();
    const count = writeDust([agedTo(PUFF_SECONDS / 2)], out);
    for (let grain = 0; grain < count; grain++) {
      const x = out.x[grain]!;
      const z = out.z[grain]!;
      const outside =
        x <= FOOTPRINT.x ||
        x >= FOOTPRINT.x + FOOTPRINT.width ||
        z <= FOOTPRINT.z ||
        z >= FOOTPRINT.z + FOOTPRINT.depth;
      expect(outside).toBe(true);
      expect(out.y[grain]!).toBeGreaterThanOrEqual(FOOTPRINT.y);
      expect(out.y[grain]!).toBeLessThan(FOOTPRINT.y + 8);
    }
    expect(Math.max(...out.scale.slice(0, count))).toBeGreaterThan(0);
  });

  it('never writes past the buffer', () => {
    const puffs = Array.from({ length: MAX_PUFFS + 3 }, () => agedTo(0.3));
    expect(writeDust(puffs, createDustBuffer())).toBe(MAX_GRAINS);
  });
});
