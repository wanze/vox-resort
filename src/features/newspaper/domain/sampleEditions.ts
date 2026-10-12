import { closeSeason, startTally, type SeasonReport } from '../../sim/domain/season';
import { editionOf, type Edition } from './edition';

const NO_MONEY = startTally().money;

const PIER = {
  key: 'sunset@pier',
  subject: 'Sunset at the Pier',
  kind: 'sunset' as const,
  count: 40,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  minute: 1_190,
};

export const seasonReport = (number: number, parts: Partial<SeasonReport>): SeasonReport => ({
  ...closeSeason(startTally(), { number, startedOn: (number - 1) * 30, state: 'break' }, 0),
  days: 28,
  ...parts,
});

const BEFORE = seasonReport(2, {
  meanStars: 3.8,
  arrived: 1_740,
  net: 9_120,
  money: { ...NO_MONEY, visit: 9_120 },
});

const GOOD = seasonReport(3, {
  meanStars: 4.3,
  bestStars: 4.7,
  worstStars: 3.9,
  arrived: 2_140,
  turnedAway: 318,
  reviews: 486,
  meanReview: 4.1,
  money: { ...NO_MONEY, visit: 30_000, night: 24_200, wages: -20_000, build: -15_780 },
  net: 18_420,
  balance: 52_960,
  busiest: { day: 68, value: 612 },
  best: { day: 70, value: 2_140 },
  voices: [
    { kind: 'queue-too-long', subject: 'Tiki Bar', count: 120 },
    { kind: 'sunset', subject: null, count: 90 },
    { kind: 'littered', subject: null, count: 40 },
  ],
  events: { held: 22, audience: 3_410, called: 2, fireworks: 3 },
  photos: 1_284,
  topSpot: PIER,
});

export const BAD = seasonReport(3, {
  meanStars: 2.6,
  worstStars: 1.9,
  arrived: 1_180,
  reviews: 402,
  meanReview: 2.4,
  money: { ...NO_MONEY, visit: 24_050, wages: -30_260 },
  net: -6_210,
  balance: 28_330,
  busiest: { day: 67, value: 388 },
  voices: [
    { kind: 'hurt', subject: null, count: 41 },
    { kind: 'littered', subject: null, count: 30 },
    { kind: 'enjoyed', subject: 'Taverna', count: 12 },
  ],
});

const FIRST = seasonReport(1, { meanStars: 3.4, arrived: 900, net: 1_200, balance: 9_200 });

export const editionWith = (
  seasons: readonly SeasonReport[],
  mode: Edition['mode'] = 'tycoon',
): Edition =>
  editionOf({
    gameId: 'game-1',
    printedOn: 88,
    resortName: 'Coral Cove',
    mode,
    seasons,
    reviews: [],
    photo: null,
  })!;

// Shaped like the mockup's two editions, for the tests to read.
export const SAMPLES = {
  good: editionWith([seasonReport(1, { meanStars: 3.1 }), BEFORE, GOOD]),
  bad: editionWith([BEFORE, BAD]),
  first: editionWith([FIRST]),
  sandbox: editionWith([BEFORE, GOOD], 'sandbox'),
  empty: editionWith([seasonReport(1, { days: 0 })], 'sandbox'),
};
