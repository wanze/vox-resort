import { describe, expect, it } from 'vitest';
import { skyStateFor } from '../../lighting/domain/dayNight';
import { CHECK_IN_TICK } from '../../sim/domain/checkIn';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import {
  EVENT_KIND_IDS,
  EVENT_KINDS,
  feeOf,
  isEventKind,
  labelOf,
  liftFor,
  memoryFor,
  runsLate,
  type AudienceParty,
  type EventKind,
} from './catalogue';
import { CHANGEOVER } from './programme';
import { START_STEP } from './week';

const KINDS = EVENT_KIND_IDS.map((id) => EVENT_KINDS[id]);

const TIERED: EventKind = {
  ...EVENT_KINDS['live-music'],
  tiers: [
    { id: 'small', label: 'Small', fee: 40, lift: 0.02, draw: 0.5 },
    { id: 'grand', label: 'Grand', fee: 900, lift: 0.3, draw: 1.5 },
  ],
};

const party = (children: number): AudienceParty => ({
  party: 0,
  kind: children > 0 ? 'family' : 'couple',
  people: 2 + children,
  children,
  arrivedOn: 0,
});

describe('EVENT_KINDS', () => {
  it('ends every kind by midnight, even from its latest start', () => {
    for (const kind of KINDS) {
      expect(kind.latest + kind.duration, kind.id).toBeLessThanOrEqual(TICKS_PER_DAY);
    }
  });

  it('offers a first start inside the hours, all on the half hour', () => {
    for (const kind of KINDS) {
      expect(kind.earliest, kind.id).toBeLessThanOrEqual(kind.start);
      expect(kind.start, kind.id).toBeLessThanOrEqual(kind.latest);
      for (const minute of [kind.earliest, kind.start, kind.latest]) {
        expect(minute % START_STEP, kind.id).toBe(0);
      }
      expect(kind.id).toSatisfy(isEventKind);
    }
  });

  it('keeps every appeal a share', () => {
    for (const kind of KINDS) {
      for (const share of Object.values(kind.appeal)) {
        expect(share, kind.id).toBeGreaterThanOrEqual(0);
        expect(share, kind.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it("lets the children's events in only parties with children", () => {
    for (const id of ['kids-show', 'kids-games', 'painting'] as const) {
      expect(EVENT_KINDS[id].audience?.(party(2), 0), id).toBe(true);
      expect(EVENT_KINDS[id].audience?.(party(0), 0), id).toBe(false);
    }
  });

  it('offers several kinds that start in the afternoon', () => {
    const afternoon = KINDS.filter((kind) => kind.earliest < 18 * 60).map((kind) => kind.id);
    expect(afternoon).toEqual([
      'kids-show',
      'kids-games',
      'painting',
      'puppet-show',
      'bingo',
      'afternoon-jazz',
      'welcome',
    ]);
  });

  it('welcomes only the parties that arrived the day before', () => {
    const welcome = EVENT_KINDS.welcome;
    expect(welcome.audience?.({ ...party(0), arrivedOn: 3 }, 4)).toBe(true);
    expect(welcome.audience?.({ ...party(1), arrivedOn: 4 }, 4)).toBe(false);
    expect(welcome.audience?.({ ...party(1), arrivedOn: 2 }, 4)).toBe(false);
  });
});

describe('fireworks', () => {
  const fireworks = EVENT_KINDS.fireworks;
  const tiers = fireworks.tiers ?? [];

  it('starts after dark and is over by midnight, even from its latest start', () => {
    expect(skyStateFor(fireworks.earliest / TICKS_PER_DAY).lampFactor).toBeGreaterThanOrEqual(0.9);
    expect(fireworks.latest + fireworks.duration).toBeLessThanOrEqual(TICKS_PER_DAY);
  });

  it('orders its tiers by fee, lift, memory and draw', () => {
    expect(tiers.map((tier) => tier.id)).toEqual(['small', 'medium', 'grand']);
    for (const key of ['fee', 'lift', 'memory', 'draw'] as const) {
      const values = tiers.map((tier) => tier[key] ?? 0);
      expect(values, key).toEqual(values.toSorted((a, b) => a - b));
      expect(new Set(values).size, key).toBe(3);
    }
  });

  it('is free in sandbox, whatever the size', () => {
    for (const tier of tiers) expect(feeOf(fireworks, tier.id, 'sandbox')).toBe(0);
    expect(feeOf(fireworks, 'grand', 'tycoon')).toBe(1_800);
  });

  it('wears off with each show seen, but never to nothing', () => {
    const novelty = fireworks.novelty!;
    expect(novelty(0)).toBe(1);
    for (let seen = 1; seen < 20; seen++) {
      expect(novelty(seen)).toBeLessThanOrEqual(novelty(seen - 1));
      expect(novelty(seen)).toBeGreaterThanOrEqual(0.1);
    }
    expect(novelty(1)).toBeLessThan(novelty(0));
    expect(novelty(100)).toBe(0.1);
  });

  it('scales both the lift and the memory by the novelty', () => {
    expect(memoryFor(fireworks, 'grand', 0)).toBeCloseTo(0.08);
    expect(memoryFor(fireworks, 'grand', 1)).toBeCloseTo(0.032);
    expect(liftFor(fireworks, 'grand', 1)).toBeCloseTo(0.072);
    expect(memoryFor(fireworks, undefined, 0)).toBeCloseTo(0.05);
    expect(memoryFor(EVENT_KINDS.musical, undefined, 0)).toBe(0);
  });

  it('names a tiered kind by its size', () => {
    expect(labelOf(fireworks, 'grand')).toBe('Grand fireworks');
    expect(labelOf(fireworks, undefined)).toBe('Fireworks');
    expect(labelOf(EVENT_KINDS.musical, undefined)).toBe('Musical');
  });
});

describe('feeOf', () => {
  it('charges nothing in free play and the kind fee in tycoon', () => {
    expect(feeOf(EVENT_KINDS.musical, undefined, 'sandbox')).toBe(0);
    expect(feeOf(EVENT_KINDS.musical, undefined, 'tycoon')).toBe(300);
  });

  it('charges nothing for the welcome, even in tycoon', () => {
    expect(feeOf(EVENT_KINDS.welcome, undefined, 'tycoon')).toBe(0);
  });

  it('takes a tier fee and lift over the kind', () => {
    expect(feeOf(TIERED, 'grand', 'tycoon')).toBe(900);
    expect(feeOf(TIERED, 'grand', 'sandbox')).toBe(0);
    expect(liftFor(TIERED, 'small', 0)).toBe(0.02);
    expect(liftFor(TIERED, 'missing', 0)).toBe(TIERED.lift);
  });
});

describe('liftFor', () => {
  it('multiplies the lift by the novelty', () => {
    const fading: EventKind = { ...TIERED, novelty: (times) => 1 / (1 + times) };
    expect(liftFor(fading, 'grand', 0)).toBeCloseTo(0.3);
    expect(liftFor(fading, 'grand', 2)).toBeCloseTo(0.1);
  });
});

describe('bonfire', () => {
  const bonfire = EVENT_KINDS.bonfire;

  it('is out from its first start a changeover before the earliest fireworks', () => {
    expect(bonfire.start + bonfire.duration + CHANGEOVER).toBeLessThanOrEqual(
      EVENT_KINDS.fireworks.earliest,
    );
    expect(runsLate(bonfire, bonfire.start)).toBe(false);
  });

  it('is lit at a fire pit on the beach, which a wheelchair cannot reach', () => {
    expect(bonfire.sites).toEqual(['beach']);
    expect(bonfire.hearth).toBe(true);
    expect(bonfire.audience?.({ ...party(1), stepFree: true }, 0)).toBe(false);
    expect(bonfire.audience?.(party(1), 0)).toBe(true);
  });
});

describe('runsLate', () => {
  it('holds exactly for a kind still running after ten', () => {
    const late = KINDS.filter((kind) => runsLate(kind, kind.latest)).map((kind) => kind.id);
    expect(late).toEqual([
      'live-music',
      'dance-night',
      'musical',
      'quiz-night',
      'cinema',
      'fireworks',
      'bonfire',
    ]);
    const early = KINDS.filter((kind) => runsLate(kind, kind.earliest)).map((kind) => kind.id);
    expect(early).toEqual(['cinema', 'fireworks']);
    expect(runsLate(EVENT_KINDS['live-music'], 20.5 * 60)).toBe(false);
  });

  it('ends the welcome by the check-in that closes its guests’ day, even from its latest start', () => {
    const welcome = EVENT_KINDS.welcome;
    expect(runsLate(welcome, welcome.start)).toBe(false);
    expect(welcome.latest + welcome.duration).toBeLessThanOrEqual(CHECK_IN_TICK);
  });
});
