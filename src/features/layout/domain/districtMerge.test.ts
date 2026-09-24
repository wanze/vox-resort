import { describe, expect, it } from 'vitest';
import { neighbourPairs, spreadPairs, uncutRuns } from './districtMerge';

const DISTRICTS = [
  { x0: 0, x1: 9, z0: 3, z1: 12 },
  { x0: 11, x1: 20, z0: 3, z1: 12 },
  { x0: 22, x1: 31, z0: 3, z1: 12 },
  { x0: 0, x1: 9, z0: 15, z1: 24 },
];

describe('neighbourPairs', () => {
  it('pairs districts either side of a droppable lane in the same row', () => {
    const pairs = neighbourPairs(DISTRICTS, () => true);
    expect(pairs.map((pair) => [pair.west, pair.east])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(pairs[0]).toMatchObject({
      cut: { at: 10, z0: 3, z1: 12 },
      merged: { x0: 0, x1: 20, z0: 3, z1: 12 },
    });
  });

  it('keeps a lane the generator will not drop', () => {
    expect(neighbourPairs(DISTRICTS, (column) => column !== 10)).toHaveLength(1);
  });

  it('pairs nothing across a street wider than a lane', () => {
    const wide = [DISTRICTS[0]!, { ...DISTRICTS[1]!, x0: 12 }];
    expect(neighbourPairs(wide, () => true)).toEqual([]);
  });
});

describe('spreadPairs', () => {
  it('never merges a district twice', () => {
    const pairs = neighbourPairs(DISTRICTS, () => true);
    const chosen = spreadPairs(pairs, 2);
    expect(chosen.length).toBeLessThanOrEqual(1);
    expect(spreadPairs(pairs, 0)).toEqual([]);
  });
});

describe('uncutRuns', () => {
  it('leaves the pieces of a lane either side of its cuts', () => {
    const cuts = [
      { at: 10, z0: 3, z1: 12 },
      { at: 10, z0: 15, z1: 24 },
      { at: 21, z0: 3, z1: 12 },
    ];
    expect(uncutRuns(10, 1, 40, cuts)).toEqual([
      { from: 1, to: 2 },
      { from: 13, to: 14 },
      { from: 25, to: 40 },
    ]);
    expect(uncutRuns(5, 1, 40, cuts)).toEqual([{ from: 1, to: 40 }]);
  });
});
