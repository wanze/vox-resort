import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../../rendering/domain/terrainSurface';
import type { LaunchSite } from './launch';
import { SPARK_LIFE, SPARKS_FROM, SPARKS_SPREAD, type ShellKind } from './shells';
import { planShow, type Shell, type Show, type TierId } from './show';
import { createStarBuffer, MAX_INSTANCES, peakInstances, writeStars } from './stars';

const SITE: LaunchSite = { x: 400, y: 0.1, z: 900 };
const SITES: readonly LaunchSite[] = Array.from({ length: 5 }, (_, index) => ({
  ...SITE,
  x: 200 + index * 100,
}));

const shellOf = (kind: ShellKind, over: Partial<Shell> = {}): Shell => ({
  launchAt: 1,
  site: SITE,
  kind,
  colour: 0xff3b30,
  burstX: 410,
  burstY: 200,
  burstZ: 905,
  rise: 2,
  radius: 60,
  stars: 40,
  whistle: false,
  seed: 1234,
  ...over,
});

const alone = (shell: Shell): Show => ({
  tier: 'grand',
  length: 20,
  shells: [shell],
  finaleFrom: 15,
});

const out = createStarBuffer();

describe('writeStars', () => {
  it('draws nothing before the first launch or after the show', () => {
    const show = planShow({ tier: 'medium', seed: 4, sites: SITES });
    expect(writeStars(show, show.shells[0]!.launchAt - 0.01, out)).toBe(0);
    expect(writeStars(show, show.length, out)).toBe(0);
    expect(writeStars(planShow({ tier: 'grand', seed: 1, sites: [] }), 10, out)).toBe(0);
  });

  it('starts every star at its burst', () => {
    const shell = shellOf('peony');
    const count = writeStars(alone(shell), shell.launchAt + shell.rise, out);
    expect(count).toBe(shell.stars);
    for (let at = 0; at < count; at++) {
      expect(out.x[at]).toBeCloseTo(shell.burstX, 3);
      expect(out.y[at]).toBeCloseTo(shell.burstY, 3);
      expect(out.z[at]).toBeCloseTo(shell.burstZ, 3);
    }
  });

  it('never draws a star under the sea', () => {
    for (const tier of ['small', 'medium', 'grand'] as const) {
      const show = planShow({ tier, seed: 8, sites: SITES });
      for (let playhead = 0; playhead < show.length; playhead += 0.1) {
        const count = writeStars(show, playhead, out);
        for (let at = 0; at < count; at++) expect(out.y[at]).toBeGreaterThanOrEqual(SEA_LEVEL);
      }
    }
  });

  it('shrinks and darkens a star once its white core is spent', () => {
    const shell = shellOf('willow');
    let scale = Infinity;
    let bright = Infinity;
    for (let t = 0.1; t < 3; t += 0.05) {
      if (writeStars(alone(shell), shell.launchAt + shell.rise + t, out) === 0) break;
      expect(out.scale[0]).toBeLessThanOrEqual(scale);
      expect(out.r[0]! + out.g[0]! + out.b[0]!).toBeLessThanOrEqual(bright);
      scale = out.scale[0]!;
      bright = out.r[0]! + out.g[0]! + out.b[0]!;
    }
    expect(scale).toBeLessThan(1);
  });

  it('lays a ring flat in one plane', () => {
    const shell = shellOf('ring', { stars: 36 });
    const count = writeStars(alone(shell), shell.launchAt + shell.rise + 0.5, out);
    expect(count).toBe(36);
    const point = (at: number) => [
      out.x[at]! - out.x[0]!,
      out.y[at]! - out.y[0]!,
      out.z[at]! - out.z[0]!,
    ];
    const [ax, ay, az] = point(9);
    const [bx, by, bz] = point(18);
    const normal = [ay! * bz! - az! * by!, az! * bx! - ax! * bz!, ax! * by! - ay! * bx!];
    const length = Math.hypot(...normal);
    for (let at = 1; at < count; at++) {
      const [x, y, z] = point(at);
      expect(Math.abs((x! * normal[0]! + y! * normal[1]! + z! * normal[2]!) / length)).toBeLessThan(
        0.01,
      );
    }
  });

  it('crackles only in the window after the burst', () => {
    const shell = shellOf('crackle', { stars: 30 });
    const burst = shell.launchAt + shell.rise;
    const sparksAt = (t: number) => writeStars(alone(shell), burst + t, out) - 30;
    expect(sparksAt(SPARKS_FROM - 0.05)).toBeLessThanOrEqual(0);
    let seen = 0;
    for (let t = SPARKS_FROM; t < SPARKS_FROM + SPARKS_SPREAD + SPARK_LIFE; t += 0.03) {
      seen = Math.max(seen, writeStars(alone(shell), burst + t, out));
    }
    expect(seen).toBeGreaterThan(0);
    expect(writeStars(alone(shell), burst + SPARKS_FROM + SPARKS_SPREAD + SPARK_LIFE, out)).toBe(0);
  });

  it('leaves out what was launched after the show was stopped', () => {
    const show = planShow({ tier: 'grand', seed: 4, sites: SITES });
    const playhead = show.finaleFrom + 2;
    const all = writeStars(show, playhead, out);
    expect(writeStars(show, playhead, out, show.finaleFrom)).toBeLessThan(all);
    expect(writeStars(show, playhead, out, -1)).toBe(0);
  });

  it('stays inside one draw call, for every size and seed', () => {
    for (const tier of ['small', 'medium', 'grand'] as readonly TierId[]) {
      for (let seed = 1; seed <= 20; seed++) {
        const peak = peakInstances(planShow({ tier, seed, sites: SITES }), 0.05);
        expect(peak, `${tier} ${seed}`).toBeLessThanOrEqual(MAX_INSTANCES);
      }
    }
  });
});
