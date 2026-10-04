import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import {
  EVENT_KIND_IDS,
  EVENT_KINDS,
  feeOf,
  isEventKind,
  liftFor,
  runsLate,
  type AudienceParty,
  type EventKind,
} from './catalogue';
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
    ]);
  });
});

describe('feeOf', () => {
  it('charges nothing in free play and the kind fee in tycoon', () => {
    expect(feeOf(EVENT_KINDS.musical, undefined, 'sandbox')).toBe(0);
    expect(feeOf(EVENT_KINDS.musical, undefined, 'tycoon')).toBe(300);
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

describe('runsLate', () => {
  it('holds exactly for a kind still running after ten', () => {
    const late = KINDS.filter((kind) => runsLate(kind, kind.latest)).map((kind) => kind.id);
    expect(late).toEqual(['live-music', 'dance-night', 'musical', 'quiz-night', 'cinema']);
    const early = KINDS.filter((kind) => runsLate(kind, kind.earliest)).map((kind) => kind.id);
    expect(early).toEqual(['cinema']);
    expect(runsLate(EVENT_KINDS['live-music'], 20.5 * 60)).toBe(false);
  });
});
