import { describe, expect, it } from 'vitest';
import {
  columnFor,
  createRaindrops,
  dropAt,
  isWet,
  MAX_DROPS,
  nearestTo,
  rainfallFor,
  type DropPose,
  type RainView,
} from './rainfall';

const CENTRE: DropPose = { x: 900, y: 40, z: 700 };

const OVERVIEW: RainView = {
  voxelsPerPixel: 1.1,
  width: 2880,
  height: 1626,
  rise: 900,
  distance: 1600,
};

const CLOSE: RainView = {
  voxelsPerPixel: 0.15,
  width: 2880,
  height: 1626,
  rise: 90,
  distance: 160,
};

const dropsOf = (count = 200, seed = 5) => createRaindrops(count, seed);

describe('rainfallFor', () => {
  it('draws nothing on the days that are not wet', () => {
    expect(rainfallFor('clear', OVERVIEW)).toBeNull();
    expect(rainfallFor('heatwave', OVERVIEW)).toBeNull();
    expect(isWet('clear')).toBe(false);
    expect(isWet('heatwave')).toBe(false);
    expect(isWet('rain')).toBe(true);
    expect(isWet('storm')).toBe(true);
  });

  it('draws a storm harder than rain on every count that says so', () => {
    const rain = rainfallFor('rain', OVERVIEW)!;
    const storm = rainfallFor('storm', OVERVIEW)!;
    expect(storm.drops).toBeGreaterThan(rain.drops);
    expect(storm.fall).toBeGreaterThan(rain.fall);
    expect(storm.opacity).toBeGreaterThan(rain.opacity);
    expect(Math.hypot(storm.leanX, storm.leanZ)).toBeGreaterThan(
      Math.hypot(rain.leanX, rain.leanZ),
    );
  });

  it('never asks for more drops than the pool the field is built with', () => {
    for (const weather of ['rain', 'storm'] as const) {
      expect(rainfallFor(weather, OVERVIEW)!.drops).toBeLessThanOrEqual(MAX_DROPS);
    }
    expect(MAX_DROPS).toBeGreaterThan(0);
  });

  it('keeps a streak the same size on screen however far the camera is out', () => {
    const near = rainfallFor('storm', CLOSE)!;
    const far = rainfallFor('storm', OVERVIEW)!;
    const zoom = OVERVIEW.voxelsPerPixel / CLOSE.voxelsPerPixel;
    expect(far.length / near.length).toBeCloseTo(zoom, 6);
    expect(far.width / near.width).toBeCloseTo(zoom, 6);
    expect(far.fall / near.fall).toBeCloseTo(zoom, 6);
  });

  it('leans the streak by the same angle at either zoom', () => {
    const near = rainfallFor('storm', CLOSE)!;
    const far = rainfallFor('storm', OVERVIEW)!;
    expect(Math.hypot(near.leanX, near.leanZ) / near.length).toBeCloseTo(
      Math.hypot(far.leanX, far.leanZ) / far.length,
      6,
    );
  });

  it('always starts the fall well above the tallest thing on the plot', () => {
    for (const view of [OVERVIEW, CLOSE, { ...CLOSE, voxelsPerPixel: 0.01 }]) {
      const look = rainfallFor('rain', view)!;
      expect(look.top).toBeGreaterThan(120);
      expect(look.height).toBeGreaterThan(look.top);
    }
  });
});

describe('columnFor', () => {
  it('covers the whole of what an overview can see', () => {
    expect(columnFor(OVERVIEW)).toBeGreaterThan(OVERVIEW.width * OVERVIEW.voxelsPerPixel);
  });

  it('shrinks with the view, so a close camera is not given sparse rain', () => {
    expect(columnFor(CLOSE)).toBeLessThan(columnFor(OVERVIEW));
  });

  it('stretches the column for a camera looking along the ground', () => {
    const steep = columnFor({ ...OVERVIEW, rise: 1590 });
    const flat = columnFor({ ...OVERVIEW, rise: 700 });
    expect(flat).toBeGreaterThan(steep);
  });

  it('is bounded at both ends rather than following the horizon', () => {
    const grazing = columnFor({ ...OVERVIEW, rise: 1, distance: 4000 });
    expect(Number.isFinite(grazing)).toBe(true);
    expect(grazing).toBeLessThanOrEqual(7000);
    expect(columnFor({ ...CLOSE, voxelsPerPixel: 1e-6 })).toBeGreaterThanOrEqual(120);
  });

  it('does not divide by a distance of nothing', () => {
    expect(Number.isFinite(columnFor({ ...CLOSE, rise: 0, distance: 0 }))).toBe(true);
  });
});

describe('createRaindrops', () => {
  it('scatters every drop over one cell of the lattice, as shares of it', () => {
    const drops = dropsOf(500);
    expect(drops.count).toBe(500);
    for (let index = 0; index < drops.count; index++) {
      expect(drops.atX[index]).toBeGreaterThanOrEqual(0);
      expect(drops.atX[index]).toBeLessThan(1);
      expect(drops.atZ[index]).toBeGreaterThanOrEqual(0);
      expect(drops.atZ[index]).toBeLessThan(1);
      expect(drops.phase[index]).toBeGreaterThanOrEqual(0);
      expect(drops.phase[index]).toBeLessThan(1);
    }
  });

  it('gives the same pool for the same seed and a different one for another', () => {
    expect([...dropsOf(20, 3).atX]).toEqual([...dropsOf(20, 3).atX]);
    expect([...dropsOf(20, 3).atX]).not.toEqual([...dropsOf(20, 4).atX]);
  });

  it('asks for no drops at all rather than a negative pool', () => {
    expect(createRaindrops(-5, 1).count).toBe(0);
  });
});

describe('nearestTo', () => {
  it('leaves a point already within half a column where it is', () => {
    expect(nearestTo(120, 100, 640)).toBe(120);
  });

  it('brings a distant point to the image nearest the camera', () => {
    const near = nearestTo(10, 10_000, 640);
    expect(Math.abs(near - 10_000)).toBeLessThanOrEqual(320);
    expect(Math.abs(near - 10) % 640).toBeCloseTo(0, 6);
  });
});

describe('dropAt', () => {
  it('falls, and stays inside the column the camera is looking at', () => {
    const drops = dropsOf();
    for (const view of [OVERVIEW, CLOSE]) {
      const look = rainfallFor('storm', view)!;
      for (const seconds of [0, 0.3, 4, 97.5]) {
        for (let index = 0; index < drops.count; index++) {
          const pose = dropAt(drops, index, seconds, look, CENTRE);
          expect(Math.abs(pose.x - CENTRE.x)).toBeLessThanOrEqual(look.column / 2 + 1e-6);
          expect(Math.abs(pose.z - CENTRE.z)).toBeLessThanOrEqual(look.column / 2 + 1e-6);
          expect(pose.y).toBeLessThanOrEqual(CENTRE.y + look.top + 1e-6);
          expect(pose.y).toBeGreaterThan(CENTRE.y + look.top - look.height - 1e-6);
        }
      }
    }
  });

  it('is lower a moment later, until it wraps back into the cloud', () => {
    const drops = dropsOf(1);
    const look = rainfallFor('rain', OVERVIEW)!;
    expect(dropAt(drops, 0, 0.05, look, CENTRE).y).toBeLessThan(
      dropAt(drops, 0, 0, look, CENTRE).y,
    );
  });

  it('is in the same place at the same second, whatever happened in between', () => {
    const drops = dropsOf(40);
    const look = rainfallFor('storm', OVERVIEW)!;
    for (let index = 0; index < drops.count; index++) {
      expect(dropAt(drops, index, 12.5, look, CENTRE)).toEqual(
        dropAt(drops, index, 12.5, look, CENTRE),
      );
    }
  });

  it('follows the camera, and jumps by whole columns when it does', () => {
    const drops = dropsOf(1);
    const look = rainfallFor('rain', OVERVIEW)!;
    const here = dropAt(drops, 0, 3, look, CENTRE);
    const away = dropAt(drops, 0, 3, look, { ...CENTRE, x: CENTRE.x + look.column });
    expect(away.x - here.x).toBeCloseTo(look.column, 4);
    expect(away.y).toBeCloseTo(here.y, 6);
    expect(away.z).toBeCloseTo(here.z, 6);
  });

  it('carries a drop downwind as it falls', () => {
    const drops = dropsOf(1);
    const look = rainfallFor('storm', OVERVIEW)!;
    const top = dropAt(drops, 0, 0, look, CENTRE);
    const lower = dropAt(drops, 0, 0.1, look, CENTRE);
    expect(lower.y).toBeLessThan(top.y);
    expect(Math.hypot(lower.x - top.x, lower.z - top.z)).toBeGreaterThan(0);
  });
});
