import { describe, expect, it } from 'vitest';
import {
  CHUNKED_VOXEL_PIXELS,
  COARSE_VOXEL_PIXELS,
  DETAIL_HYSTERESIS,
  distanceToBox,
  HIDDEN_PIXELS,
  isFar,
  isHidden,
  orthographicLens,
  perspectiveLens,
  pixelsPerVoxel,
  regionLevelOf,
  standsOut,
  worthCoarsening,
} from './levelOfDetail';

describe('lenses', () => {
  it('gives a perspective camera half the buffer per voxel at the distance a 90° view spans', () => {
    const lens = perspectiveLens(1000, 90);
    // tan(45 deg) = 1, so one voxel at 500 voxels away covers one pixel.
    expect(pixelsPerVoxel(lens, 500)).toBeCloseTo(1, 6);
    expect(pixelsPerVoxel(lens, 1000)).toBeCloseTo(0.5, 6);
  });

  it('never divides by a distance under a voxel', () => {
    const lens = perspectiveLens(1000, 90);
    expect(pixelsPerVoxel(lens, 0)).toBe(pixelsPerVoxel(lens, 1));
  });

  it('gives an orthographic camera the same answer at every distance', () => {
    const lens = orthographicLens(800, 400);
    expect(pixelsPerVoxel(lens, 10)).toBe(2);
    expect(pixelsPerVoxel(lens, 10_000)).toBe(2);
  });
});

describe('distanceToBox', () => {
  const box = { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 };

  it('is zero inside the box', () => {
    expect(distanceToBox(5, 5, 5, box)).toBe(0);
  });

  it('measures to the nearest face, edge or corner', () => {
    expect(distanceToBox(15, 5, 5, box)).toBe(5);
    expect(distanceToBox(13, 14, 5, box)).toBe(5);
    expect(distanceToBox(-1, -2, -2, box)).toBe(3);
  });
});

const FAR_CUT = COARSE_VOXEL_PIXELS / 2;

describe('isFar', () => {
  it('keeps a region near while a coarse voxel would still show', () => {
    expect(isFar(false, FAR_CUT * 1.01)).toBe(false);
    expect(isFar(false, FAR_CUT * 0.99)).toBe(true);
  });

  it('keeps a far region far until it is clearly near again', () => {
    expect(isFar(true, FAR_CUT * (DETAIL_HYSTERESIS - 0.01))).toBe(true);
    expect(isFar(true, FAR_CUT * (DETAIL_HYSTERESIS + 0.01))).toBe(false);
  });
});

describe('regionLevelOf', () => {
  it('chunks a region up close, draws it whole further out, and coarse far away', () => {
    expect(regionLevelOf(null, CHUNKED_VOXEL_PIXELS * DETAIL_HYSTERESIS * 1.01)).toBe('near');
    expect(regionLevelOf(null, CHUNKED_VOXEL_PIXELS * 0.99)).toBe('mid');
    expect(regionLevelOf(null, FAR_CUT * 1.01)).toBe('mid');
    expect(regionLevelOf(null, FAR_CUT * 0.99)).toBe('far');
  });

  it('holds a chunked region chunked until it is clearly further out', () => {
    expect(regionLevelOf('near', CHUNKED_VOXEL_PIXELS * 1.01)).toBe('near');
    expect(regionLevelOf('near', CHUNKED_VOXEL_PIXELS * 0.99)).toBe('mid');
    expect(regionLevelOf('mid', CHUNKED_VOXEL_PIXELS * 1.1)).toBe('mid');
  });

  it('holds a far region far until it is clearly near again', () => {
    expect(regionLevelOf('far', FAR_CUT * (DETAIL_HYSTERESIS - 0.01))).toBe('far');
    expect(regionLevelOf('far', FAR_CUT * (DETAIL_HYSTERESIS + 0.01))).toBe('mid');
  });
});

describe('isHidden', () => {
  const cut = HIDDEN_PIXELS / 32;

  it('hides an object once it is a few pixels across', () => {
    expect(isHidden(false, cut * 0.99, 32)).toBe(true);
    expect(isHidden(false, cut * 1.01, 32)).toBe(false);
  });

  it('keeps a hidden object hidden until it clearly stands out again', () => {
    expect(isHidden(true, cut * (DETAIL_HYSTERESIS - 0.01), 32)).toBe(true);
    expect(isHidden(true, cut * (DETAIL_HYSTERESIS + 0.01), 32)).toBe(false);
  });

  it('hides a small prop long before a building', () => {
    expect(isHidden(false, 0.4, 4)).toBe(true);
    expect(isHidden(false, 0.4, 48)).toBe(false);
  });
});

describe('standsOut', () => {
  it('draws a figure only while it is a few pixels tall', () => {
    expect(standsOut(HIDDEN_PIXELS / 7, 7)).toBe(true);
    expect(standsOut((HIDDEN_PIXELS / 7) * 0.9, 7)).toBe(false);
  });
});

describe('worthCoarsening', () => {
  it('keeps a coarse model that sheds enough triangles', () => {
    expect(worthCoarsening(1000, 600)).toBe(true);
    expect(worthCoarsening(1000, 601)).toBe(false);
  });

  it('refuses a coarse model with nothing in it', () => {
    expect(worthCoarsening(1000, 0)).toBe(false);
  });
});
