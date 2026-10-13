import { describe, expect, it } from 'vitest';
import { shoreFor, terrainAt, waterStartZ } from '../../layout/domain/shoreline';
import { flotsamOn, strandOf } from './flotsam';

// Water from z = 18, sand from z = 12.
const shore = shoreFor({
  tilesX: 40,
  tilesZ: 20,
  shore: { inset: 1, beach: 6, wave: 2, seed: 4 },
})!;

const everywhere = () => true;

describe('strandOf', () => {
  it('takes the two rows of sand the waves reach, over the owned columns only', () => {
    const strand = strandOf(shore, { from: 5, to: 25 });
    expect(strand).toHaveLength(40);
    for (const { tileX, tileZ } of strand) {
      expect(tileX).toBeGreaterThanOrEqual(5);
      expect(tileX).toBeLessThan(25);
      expect(terrainAt(shore, tileX, tileZ)).toBe('beach');
      expect(waterStartZ(shore, tileX) - tileZ).toBeLessThanOrEqual(2);
    }
  });

  it('has no strand without a sea', () => {
    expect(strandOf(null, { from: 0, to: 40 })).toEqual([]);
  });
});

describe('flotsamOn', () => {
  const strand = strandOf(shore, { from: 0, to: 40 });

  it('leaves a tideline on about a third of the strand, a few pieces a tile', () => {
    const left = flotsamOn(strand, 3, everywhere);
    expect(left.length).toBeGreaterThan(strand.length * 0.15);
    expect(left.length).toBeLessThan(strand.length * 0.55);
    for (const each of left) {
      expect(each.pieces).toBeGreaterThanOrEqual(1);
      expect(each.pieces).toBeLessThanOrEqual(3);
    }
  });

  it('is the same tideline on a replay, and another after the next storm', () => {
    expect(flotsamOn(strand, 3, everywhere)).toEqual(flotsamOn(strand, 3, everywhere));
    expect(flotsamOn(strand, 3, everywhere)).not.toEqual(flotsamOn(strand, 4, everywhere));
  });

  it('leaves nothing where a building stands', () => {
    expect(flotsamOn(strand, 3, () => false)).toEqual([]);
  });
});
