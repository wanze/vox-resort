import { describe, expect, it } from 'vitest';
import { groupBySection, originsFor, type VolumeSize } from './sectionGrid';

const SECTION: VolumeSize = { x: 16, y: 16, z: 16 };
const SECTOR: VolumeSize = { x: 16, y: 256, z: 16 };

const positionsOf = (...writes: readonly (readonly [number, number, number])[]): Int32Array =>
  Int32Array.from(writes.flat());

describe('originsFor', () => {
  it('snaps down to the containing volume', () => {
    expect(originsFor(positionsOf([17, 3, 31]), SECTION)).toEqual([{ x: 16, y: 0, z: 16 }]);
  });

  it('leaves an exact origin untouched', () => {
    expect(originsFor(positionsOf([32, 16, 0]), SECTION)).toEqual([{ x: 32, y: 16, z: 0 }]);
  });

  it('floors negative coordinates away from zero', () => {
    expect(originsFor(positionsOf([-1, 0, -17]), SECTION)).toEqual([{ x: -16, y: 0, z: -32 }]);
  });

  it('deduplicates volumes and preserves first-touch order', () => {
    const origins = originsFor(positionsOf([20, 0, 0], [0, 0, 0], [1, 1, 1], [21, 0, 0]), SECTION);
    expect(origins).toEqual([
      { x: 16, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
  });

  it('collapses a tall sector column into one sector', () => {
    expect(originsFor(positionsOf([2, 0, 2], [2, 200, 2]), SECTOR)).toHaveLength(1);
  });

  it('keeps volumes apart that differ on one axis only, negative ones included', () => {
    const origins = originsFor(
      positionsOf([0, 0, 0], [-1, 0, 0], [0, 16, 0], [0, 0, -1], [0, 0, 16]),
      SECTION,
    );
    expect(origins).toHaveLength(5);
  });

  it('returns nothing for no writes', () => {
    expect(originsFor(new Int32Array(0), SECTION)).toEqual([]);
  });

  it('rejects a zero-sized volume', () => {
    expect(() => originsFor(positionsOf([0, 0, 0]), { x: 0, y: 16, z: 16 })).toThrow();
  });

  it('refuses a position too far out to name its volume exactly', () => {
    expect(() => originsFor(positionsOf([2 ** 30, 0, 0]), { x: 1, y: 1, z: 1 })).toThrow(/too far/);
  });
});

describe('groupBySection', () => {
  it('routes each write into the section that owns it', () => {
    const buckets = groupBySection(positionsOf([0, 0, 0], [17, 0, 0], [3, 0, 3]), SECTION);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect([...buckets[0]!.indices]).toEqual([0, 2]);
    expect([...buckets[1]!.indices]).toEqual([1]);
  });

  it('splits an object that straddles a section boundary', () => {
    const buckets = groupBySection(positionsOf([15, 0, 0], [16, 0, 0]), SECTION);
    expect(buckets).toHaveLength(2);
  });

  it('keeps every write exactly once, in the order it was made', () => {
    const positions = positionsOf([1, 1, 1], [40, 20, 5], [2, 2, 2], [40, 20, 6], [-5, 0, 0]);
    const buckets = groupBySection(positions, SECTION);
    expect(buckets.map((bucket) => Array.from(bucket.indices))).toEqual([[0, 2], [1, 3], [4]]);
  });

  it('groups nothing for no writes', () => {
    expect(groupBySection(new Int32Array(0), SECTION)).toEqual([]);
  });
});
