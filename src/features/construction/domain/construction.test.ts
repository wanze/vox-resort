import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../resort-sim/domain/simNow';
import {
  buildTicks,
  finishedSites,
  GRAIN_VOXELS,
  leadVoxels,
  paintLineOf,
  POP_SECONDS,
  popStretchAt,
  siteProgress,
  sitePins,
  withoutSite,
  withSite,
  type BuildModel,
} from './construction';

// The catalogue's real numbers, so the tuning is pinned to real models.
const HOTEL: BuildModel = { category: 'lodging', voxelCount: 221678 };
const COTTAGE: BuildModel = { category: 'lodging', voxelCount: 23537 };
const CABINS: BuildModel = { category: 'amenities', voxelCount: 3876 };
const SHOWER: BuildModel = { category: 'amenities', voxelCount: 660 };
const PATH: BuildModel = { category: 'grounds', voxelCount: 512 };
const POOL: BuildModel = { category: 'leisure', voxelCount: 23787 };

const hoursOf = (model: BuildModel): number => buildTicks(model) / TICKS_PER_HOUR;

describe('buildTicks', () => {
  it('builds what has a door and puts down everything else', () => {
    expect(buildTicks(HOTEL)).toBeGreaterThan(0);
    expect(buildTicks(COTTAGE)).toBeGreaterThan(0);
    expect(buildTicks(CABINS)).toBeGreaterThan(0);
    expect(buildTicks(PATH)).toBe(0);
    expect(buildTicks(POOL)).toBe(0);
    expect(buildTicks(SHOWER)).toBe(0);
  });

  it('takes longer over more building', () => {
    expect(buildTicks(HOTEL)).toBeGreaterThan(buildTicks(COTTAGE));
    expect(buildTicks(COTTAGE)).toBeGreaterThan(buildTicks(CABINS));
  });

  it('takes a hotel most of a day and a small block a morning', () => {
    expect(hoursOf(HOTEL)).toBeGreaterThanOrEqual(18);
    expect(hoursOf(COTTAGE)).toBeGreaterThan(6);
    expect(hoursOf(CABINS)).toBeLessThanOrEqual(6);
    expect(hoursOf({ category: 'lodging', voxelCount: 40_000_000 })).toBe(24);
  });

  it('ends on the hour', () => {
    for (const model of [HOTEL, COTTAGE, CABINS]) {
      expect(buildTicks(model) % TICKS_PER_HOUR).toBe(0);
    }
  });
});

describe('sites', () => {
  it('opens a site and closes it again without touching the map it was handed', () => {
    const none = new Map<string, number>();
    const one = withSite(none, 'hotel#1', 600);
    expect(none.size).toBe(0);
    expect([...one]).toEqual([['hotel#1', 600]]);
    expect(withoutSite(one, 'hotel#1').size).toBe(0);
    expect(one.size).toBe(1);
  });

  it('hands back the same map when there was no such site', () => {
    const one = withSite(new Map(), 'hotel#1', 600);
    expect(withoutSite(one, 'bar#1')).toBe(one);
  });

  it('finishes a site on its tick, not before', () => {
    const sites = new Map([
      ['hotel#1', 600],
      ['bar#1', 300],
    ]);
    expect(finishedSites(sites, 299)).toEqual([]);
    expect(finishedSites(sites, 300)).toEqual(['bar#1']);
    expect(finishedSites(sites, 900)).toEqual(['hotel#1', 'bar#1']);
  });
});

describe('siteProgress', () => {
  it('runs from nothing to done over the build', () => {
    expect(siteProgress(600, 240, 360)).toBe(0);
    expect(siteProgress(600, 240, 480)).toBe(0.5);
    expect(siteProgress(600, 240, 600)).toBe(1);
  });

  it('stays inside its range on either side', () => {
    expect(siteProgress(600, 240, 0)).toBe(0);
    expect(siteProgress(600, 240, 9_000)).toBe(1);
    expect(siteProgress(600, 0, 0)).toBe(1);
  });
});

describe('paintLineOf', () => {
  it('starts with nothing painted', () => {
    expect(paintLineOf(0, 57)).toBe(0);
  });

  it('clears the laggiest column, so a building is all colour when done', () => {
    for (const height of [16, 25, 57]) {
      expect(paintLineOf(1, height)).toBeGreaterThanOrEqual(
        height + leadVoxels(height) + GRAIN_VOXELS,
      );
    }
  });

  it('never goes backwards', () => {
    let last = -1;
    for (let step = 0; step <= 40; step++) {
      const at = paintLineOf(step / 40, 57);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });

  it('eases rather than running at a constant rate', () => {
    const top = paintLineOf(1, 57);
    expect(paintLineOf(0.25, 57)).toBeLessThan(top * 0.25);
    expect(paintLineOf(0.75, 57)).toBeGreaterThan(top * 0.75);
    expect(paintLineOf(0.5, 57)).toBeCloseTo(top * 0.5);
  });

  it('stays inside its range whatever progress it is handed', () => {
    expect(paintLineOf(-1, 25)).toBe(0);
    expect(paintLineOf(5, 25)).toBe(paintLineOf(1, 25));
  });
});

describe('leadVoxels', () => {
  it('gives a low model a ragged edge rather than a hairline', () => {
    expect(leadVoxels(6)).toBeGreaterThanOrEqual(6);
  });

  it('grows with the model, so a hotel is as ragged as a bungalow', () => {
    expect(leadVoxels(57)).toBeGreaterThan(leadVoxels(25));
  });
});

describe('popStretchAt', () => {
  it('starts and ends at rest', () => {
    expect(popStretchAt(0)).toBe(1);
    expect(popStretchAt(POP_SECONDS)).toBeCloseTo(1);
    expect(popStretchAt(POP_SECONDS * 3)).toBeCloseTo(1);
  });

  it('stretches up, then squats below rest, by a few percent', () => {
    expect(popStretchAt(POP_SECONDS * 0.25)).toBeGreaterThan(1.03);
    expect(popStretchAt(POP_SECONDS * 0.75)).toBeLessThan(1);
    for (let step = 0; step <= 20; step++) {
      expect(Math.abs(popStretchAt((POP_SECONDS * step) / 20) - 1)).toBeLessThan(0.1);
    }
  });
});

const labelOf = (placement: { readonly id: string }): string => placement.id.toUpperCase();

describe('sitePins', () => {
  const placements = [
    { key: 'hotel#1', id: 'hotel', tileX: 4, tileZ: 6 },
    { key: 'bar#1', id: 'bar', tileX: 1, tileZ: 2 },
  ];

  it('pins each site with when it started and when it opens', () => {
    const pins = sitePins(new Map([['hotel#1', 900]]), placements, labelOf, () => 300);
    expect(pins).toEqual([
      {
        key: 'hotel#1',
        label: 'HOTEL',
        at: { tileX: 4, tileZ: 6 },
        works: { kind: 'building', from: 600, until: 900 },
      },
    ]);
  });

  it('skips a site whose building is gone', () => {
    expect(sitePins(new Map([['villa#1', 900]]), placements, labelOf, () => 300)).toEqual([]);
  });
});
