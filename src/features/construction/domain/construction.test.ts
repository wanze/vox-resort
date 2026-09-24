import { describe, expect, it } from 'vitest';
import type { Placement } from '../../layout/domain/resortLayout';
import {
  advanceSites,
  buildSeconds,
  FOUNDATION_VOXELS,
  GRAIN_VOXELS,
  leadVoxels,
  openSite,
  progressOf,
  revealHeightOf,
  type BuildModel,
  type ConstructionSite,
} from './construction';

const standing = (key: string): Placement => ({
  key,
  id: 'hotel',
  tileX: 0,
  tileZ: 0,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x: 0,
  z: 0,
  y: 0,
  width: 16,
  depth: 16,
});

// The catalogue's real numbers, so the tuning is pinned to real models.
const HOTEL: BuildModel = { category: 'lodging', height: 57, voxelCount: 221678 };
const COTTAGE: BuildModel = { category: 'lodging', height: 25, voxelCount: 23537 };
const CABINS: BuildModel = { category: 'amenities', height: 16, voxelCount: 3876 };
const SHOWER: BuildModel = { category: 'amenities', height: 12, voxelCount: 660 };
const PATH: BuildModel = { category: 'grounds', height: 2, voxelCount: 512 };
const POOL: BuildModel = { category: 'leisure', height: 15, voxelCount: 23787 };

const site = (key: string, duration: number, height = 25): ConstructionSite =>
  openSite(standing(key), height, duration);

describe('buildSeconds', () => {
  it('builds what has a door and puts down everything else', () => {
    expect(buildSeconds(HOTEL)).toBeGreaterThan(0);
    expect(buildSeconds(COTTAGE)).toBeGreaterThan(0);
    expect(buildSeconds(CABINS)).toBeGreaterThan(0);
    expect(buildSeconds(PATH)).toBe(0);
    expect(buildSeconds(POOL)).toBe(0);
    expect(buildSeconds(SHOWER)).toBe(0);
  });

  it('takes longer over more building', () => {
    expect(buildSeconds(HOTEL)).toBeGreaterThan(buildSeconds(COTTAGE));
    expect(buildSeconds(COTTAGE)).toBeGreaterThan(buildSeconds(CABINS));
  });

  it('keeps the whole catalogue inside a span worth watching', () => {
    for (const model of [HOTEL, COTTAGE, CABINS]) {
      expect(buildSeconds(model)).toBeGreaterThan(3);
      expect(buildSeconds(model)).toBeLessThanOrEqual(24);
    }
    expect(buildSeconds({ category: 'lodging', height: 400, voxelCount: 40_000_000 })).toBe(24);
  });

  it('gives the same model the same answer twice', () => {
    expect(buildSeconds(HOTEL)).toBe(buildSeconds(HOTEL));
  });
});

describe('advanceSites', () => {
  it('has nothing to do with nothing going up', () => {
    expect(advanceSites([], 0.5)).toEqual({ sites: [], finished: [] });
  });

  it('moves a site along without finishing it', () => {
    const tick = advanceSites([site('a', 10)], 0.05);
    expect(tick.finished).toEqual([]);
    expect(tick.sites[0]?.elapsed).toBeCloseTo(0.05);
  });

  it('hands back the sites that finished, and drops them', () => {
    const nearly = { ...site('a', 0.04), elapsed: 0.03 };
    const tick = advanceSites([nearly, site('b', 10)], 0.05);
    expect(tick.finished.map((done) => done.placement.key)).toEqual(['a']);
    expect(tick.sites.map((going) => going.placement.key)).toEqual(['b']);
  });

  it('never lets a site run past its own duration', () => {
    const tick = advanceSites([site('a', 0.01)], 0.05);
    expect(tick.finished[0]?.elapsed).toBe(0.01);
    expect(progressOf(tick.finished[0]!)).toBe(1);
  });

  it('clamps a backgrounded tab, so nothing finishes while nobody is looking', () => {
    const tick = advanceSites([site('a', 60)], 600);
    expect(tick.finished).toEqual([]);
    expect(tick.sites[0]?.elapsed).toBeCloseTo(0.1);
  });

  it('does nothing on a still or backwards frame', () => {
    for (const dt of [0, -5]) {
      expect(advanceSites([site('a', 10)], dt).sites[0]?.elapsed).toBe(0);
    }
  });

  it('leaves what it was given alone', () => {
    const sites = [site('a', 10)];
    const before = { ...sites[0]! };
    advanceSites(sites, 0.05);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toEqual(before);
  });
});

describe('revealHeightOf', () => {
  it('starts below the foundation, so placing something lays its floor', () => {
    expect(revealHeightOf(0, 57)).toBeLessThan(FOUNDATION_VOXELS);
  });

  it('clears the laggiest column, so a building actually finishes', () => {
    for (const height of [16, 25, 57]) {
      expect(revealHeightOf(1, height)).toBeGreaterThanOrEqual(
        height + leadVoxels(height) + GRAIN_VOXELS,
      );
    }
  });

  it('never goes backwards', () => {
    let last = -1;
    for (let step = 0; step <= 40; step++) {
      const at = revealHeightOf(step / 40, 57);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });

  it('eases rather than running at a constant rate', () => {
    const top = revealHeightOf(1, 57);
    expect(revealHeightOf(0.25, 57)).toBeLessThan(top * 0.25);
    expect(revealHeightOf(0.75, 57)).toBeGreaterThan(top * 0.75);
    expect(revealHeightOf(0.5, 57)).toBeCloseTo(top * 0.5);
  });

  it('stays inside its range whatever progress it is handed', () => {
    expect(revealHeightOf(-1, 25)).toBe(0);
    expect(revealHeightOf(5, 25)).toBe(revealHeightOf(1, 25));
  });
});

describe('leadVoxels', () => {
  it('gives a low model a building site rather than a hairline', () => {
    expect(leadVoxels(6)).toBeGreaterThanOrEqual(6);
  });

  it('grows with the model, so a hotel is as ragged as a bungalow', () => {
    expect(leadVoxels(57)).toBeGreaterThan(leadVoxels(25));
  });
});
