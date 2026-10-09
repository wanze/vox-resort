import { describe, expect, it } from 'vitest';
import {
  createFootfall,
  fadeFootfall,
  footfallValues,
  gridValues,
  MIN_SEEN,
  moodValues,
  OVERLAY_KINDS,
  overlayValuesFor,
  reachValues,
  sampleFootfall,
  TOO_FAR_HOPS,
  type OverlaySources,
} from './overlays';

const sampled = (nodes: number, at: readonly number[], moods: readonly number[], times = 1) => {
  const footfall = createFootfall(nodes);
  const node = Int32Array.from(at);
  const present = new Uint8Array(at.length).fill(1);
  const mood = Float32Array.from(moods);
  for (let pass = 0; pass < times; pass++) sampleFootfall(footfall, node, present, mood);
  return footfall;
};

describe('sampleFootfall', () => {
  it('counts every present guest on the node they stand at, with their mood', () => {
    const footfall = sampled(3, [0, 2, 2], [0.5, 0.25, 0.75]);
    expect([...footfall.seen]).toEqual([1, 0, 2]);
    expect([...footfall.mood]).toEqual([0.5, 0, 1]);
  });

  it('leaves out guests who are away', () => {
    const footfall = createFootfall(2);
    sampleFootfall(
      footfall,
      Int32Array.from([0, 1]),
      Uint8Array.from([0, 1]),
      Float32Array.from([1, 1]),
    );
    expect([...footfall.seen]).toEqual([0, 1]);
  });

  it('leaves out guests off the graph or past its end', () => {
    const footfall = sampled(2, [-1, 5, 1], [1, 1, 1]);
    expect([...footfall.seen]).toEqual([0, 1]);
  });
});

describe('fadeFootfall', () => {
  it('halves both what was seen and the mood it was seen in', () => {
    const footfall = sampled(2, [0, 0, 1], [0.5, 0.5, 1]);
    fadeFootfall(footfall);
    expect([...footfall.seen]).toEqual([1, 0.5]);
    expect([...footfall.mood]).toEqual([0.5, 0.5]);
  });
});

describe('footfallValues', () => {
  it('measures each node against the busiest', () => {
    const values = footfallValues(sampled(3, [0, 0, 0, 0, 1], [1, 1, 1, 1, 1]));
    expect(values[0]).toBe(1);
    expect(values[1]).toBeCloseTo(0.25);
  });

  it('says nothing where nobody walked', () => {
    const values = footfallValues(sampled(3, [0], [1]));
    expect(values[1]).toBeNaN();
    expect(values[2]).toBeNaN();
  });
});

describe('moodValues', () => {
  it('says nothing until a node has been seen often enough', () => {
    const values = moodValues(sampled(1, [0], [0], MIN_SEEN - 1));
    expect(values[0]).toBeNaN();
  });

  it('is high where the guests seen are unhappy', () => {
    const values = moodValues(sampled(2, [0, 1], [0.2, 0.9], MIN_SEEN));
    expect(values[0]).toBeCloseTo(0.8);
    expect(values[1]).toBeCloseTo(0.1);
  });
});

describe('reachValues', () => {
  it('scales hops by the distance counted too far, and stops at 1', () => {
    const values = reachValues(Int32Array.from([0, 5, 10, 40]), 10);
    expect([...values]).toEqual([0, 0.5, 1, 1]);
  });

  it('paints a node nothing reaches as bad as it gets', () => {
    expect(reachValues(Int32Array.from([-1]), 10)[0]).toBe(1);
  });

  it('counts too far in tiles of the smallest reach', () => {
    expect(TOO_FAR_HOPS).toBeGreaterThan(0);
    expect(Number.isFinite(TOO_FAR_HOPS)).toBe(true);
  });
});

describe('gridValues', () => {
  const grid = { tilesX: 2, tilesZ: 2, value: Float32Array.from([0, 0.25, 0.5, 1]) };
  const tiles = [
    { tileX: 1, tileZ: 0 },
    { tileX: 0, tileZ: 1 },
    { tileX: 2, tileZ: 0 },
    { tileX: 0, tileZ: -1 },
  ];
  const tileOf = (node: number) => tiles[node]!;

  it('reads the tile under each node', () => {
    const values = gridValues(grid, tileOf, 2, 1);
    expect([...values]).toEqual([0.25, 0.5]);
  });

  it('turns the grid over for a layer where low is bad', () => {
    const values = gridValues(grid, tileOf, 2, -1);
    expect([...values]).toEqual([0.75, 0.5]);
  });

  it('says nothing for a node off the grid', () => {
    const values = gridValues(grid, tileOf, 4, -1);
    expect(values[2]).toBeNaN();
    expect(values[3]).toBeNaN();
  });
});

describe('overlayValuesFor', () => {
  const asked: string[] = [];
  const sources: OverlaySources = {
    footfall: sampled(2, [0, 0, 1], [1, 1, 1]),
    nodes: 2,
    tileOf: (node) => ({ tileX: node, tileZ: 0 }),
    hopsTo: (need) => {
      asked.push(need);
      return Int32Array.from([0, -1]);
    },
    scenery: { tilesX: 2, tilesZ: 1, value: Float32Array.from([1, 0]) },
    litter: { tilesX: 2, tilesZ: 1, value: Float32Array.from([0, 0.5]) },
    stepFree: () => Float32Array.from([0, 1]),
    photos: Float32Array.from([0, 4]),
  };

  it('sweeps from the need each reach layer is about, and only that one', () => {
    asked.length = 0;
    expect([...overlayValuesFor('reach-food', sources)]).toEqual([0, 1]);
    overlayValuesFor('reach-drink', sources);
    overlayValuesFor('reach-wash', sources);
    overlayValuesFor('footfall', sources);
    expect(asked).toEqual(['hunger', 'thirst', 'hygiene']);
  });

  it('reads footfall and mood off the samples', () => {
    expect([...overlayValuesFor('footfall', sources)]).toEqual([1, 0.5]);
    expect(overlayValuesFor('mood', sources)[0]).toBeNaN();
  });

  it('reads photos by the most photographed node, and nothing where none were taken', () => {
    const values = overlayValuesFor('photos', sources);
    expect(values[0]).toBeNaN();
    expect(values[1]).toBe(1);
  });

  it('turns scenery over and reads litter as it lies', () => {
    expect([...overlayValuesFor('scenery', sources)]).toEqual([0, 1]);
    expect([...overlayValuesFor('litter', sources)]).toEqual([0, 0.5]);
  });
});

describe('overlayValuesFor, step-free', () => {
  it('hands over the step-free reach as it was swept, and sweeps nothing else', () => {
    const swept = Float32Array.from([0, 1, Number.NaN]);
    let asked = 0;
    const values = overlayValuesFor('step-free', {
      footfall: createFootfall(3),
      nodes: 3,
      tileOf: (node) => ({ tileX: node, tileZ: 0 }),
      hopsTo: () => {
        asked++;
        return new Int32Array(3);
      },
      stepFree: () => swept,
      scenery: { tilesX: 3, tilesZ: 1, value: new Float32Array(3) },
      litter: { tilesX: 3, tilesZ: 1, value: new Float32Array(3) },
      photos: new Float32Array(3),
    });
    expect(values).toBe(swept);
    expect(asked).toBe(0);
    expect(OVERLAY_KINDS).toContain('step-free');
  });
});
