import { describe, expect, it } from 'vitest';
import type { LaunchSite } from './launch';
import { lifeOf } from './shells';
import {
  benchShow,
  planShow,
  playheadFor,
  SHOW_SECONDS,
  showSeed,
  tierIdOf,
  type Show,
  type TierId,
} from './show';

const SITES: readonly LaunchSite[] = Array.from({ length: 5 }, (_, index) => ({
  x: 200 + index * 100,
  y: 0.1,
  z: 900,
}));

const TIERS: readonly TierId[] = ['small', 'medium', 'grand'];

const rate = (show: Show, from: number, to: number): number =>
  show.shells.filter((shell) => shell.launchAt >= from && shell.launchAt < to).length / (to - from);

describe('planShow', () => {
  it('plans the same show from the same seed, and another from another', () => {
    const one = planShow({ tier: 'grand', seed: 5, sites: SITES });
    expect(planShow({ tier: 'grand', seed: 5, sites: SITES })).toEqual(one);
    expect(planShow({ tier: 'grand', seed: 6, sites: SITES })).not.toEqual(one);
  });

  it('launches in order, all inside the show', () => {
    for (const tier of TIERS) {
      const show = planShow({ tier, seed: 11, sites: SITES });
      expect(show.length).toBe(SHOW_SECONDS[tier]);
      const launches = show.shells.map((shell) => shell.launchAt);
      expect(launches).toEqual(launches.toSorted((a, b) => a - b));
      expect(launches[0]).toBeGreaterThanOrEqual(0);
      expect(launches.at(-1)).toBeLessThan(show.length);
    }
  });

  it('bursts high over the sea, and the last star is out before the show ends', () => {
    for (const tier of TIERS) {
      for (let seed = 1; seed <= 10; seed++) {
        const show = planShow({ tier, seed, sites: SITES });
        for (const shell of show.shells) {
          expect(shell.burstY - shell.site.y).toBeGreaterThanOrEqual(150);
          expect(shell.launchAt + shell.rise + lifeOf(shell.kind)).toBeLessThanOrEqual(show.length);
        }
      }
    }
  });

  it('ends in a finale at least three times as busy as the opening', () => {
    for (const tier of TIERS) {
      const show = planShow({ tier, seed: 3, sites: SITES });
      const finale = rate(show, show.finaleFrom, show.shells.at(-1)!.launchAt);
      expect(finale).toBeGreaterThanOrEqual(3 * rate(show, 0, 8));
    }
  });

  it('keeps rings and crackle for the larger shows', () => {
    const small = planShow({ tier: 'small', seed: 9, sites: SITES });
    const body = small.shells.filter((shell) => shell.launchAt < small.finaleFrom);
    expect(body.every((shell) => shell.kind === 'peony' || shell.kind === 'willow')).toBe(true);
    const grand = planShow({ tier: 'grand', seed: 9, sites: SITES });
    expect(grand.shells.some((shell) => shell.kind === 'crackle')).toBe(true);
  });

  it('closes with a ring from every site, and uses every site', () => {
    const grand = planShow({ tier: 'grand', seed: 2, sites: SITES });
    const last = grand.shells.at(-1)!.launchAt;
    const closing = grand.shells.filter((shell) => shell.launchAt === last);
    expect(closing.map((shell) => shell.kind)).toEqual(SITES.map(() => 'ring'));
    expect(new Set(grand.shells.map((shell) => shell.site))).toEqual(new Set(SITES));
  });

  it('has nothing to launch with nowhere to launch from', () => {
    expect(planShow({ tier: 'grand', seed: 1, sites: [] }).shells).toEqual([]);
  });

  it('seeds a night by its booking and day', () => {
    expect(showSeed({ booking: 3, day: 4 })).toBe(showSeed({ booking: 3, day: 4 }));
    expect(showSeed({ booking: 3, day: 5 })).not.toBe(showSeed({ booking: 3, day: 4 }));
  });
});

describe('playheadFor', () => {
  const run = { start: 1000, end: 1030 };

  it('plays from the top at a fresh start, and mid-show after a load', () => {
    expect(playheadFor(run, 1000, 90)).toBe(0);
    expect(playheadFor(run, 1002, 90)).toBe(0);
    expect(playheadFor(run, 1015, 90)).toBe(45);
    expect(playheadFor(run, 1100, 90)).toBe(90);
  });
});

describe('tierIdOf', () => {
  it('plays a booking with no size, or an unknown one, as a medium show', () => {
    expect(tierIdOf('grand')).toBe('grand');
    expect(tierIdOf('small')).toBe('small');
    expect(tierIdOf(undefined)).toBe('medium');
    expect(tierIdOf('colossal')).toBe('medium');
  });
});

describe('benchShow', () => {
  it('ends the seconds played just after the closing rings burst', () => {
    const { show, from } = benchShow('grand', SITES, 30);
    const closing = show.shells.at(-1)!;
    expect(from + 30).toBeGreaterThan(closing.launchAt + closing.rise);
    expect(from + 30).toBeLessThan(show.length);
    expect(benchShow('small', SITES, 1_000).from).toBe(0);
  });
});
