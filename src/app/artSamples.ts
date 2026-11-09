import {
  createBookings,
  type Booking,
  type BookingsState,
  type Settlement,
} from '../features/bookings/domain/bookings';
import {
  bookingsViewOf,
  type Answer,
  type BookingsView,
  type OfferCard,
} from '../features/bookings/domain/bookingsView';
import { reportOf, startDay, type DayReport } from '../features/sim/domain/dayReport';
import { closeDay, createLedger, record, type Ledger } from '../features/sim/domain/ledger';
import type { Offer } from '../features/bookings/domain/offers';
import { OPERATORS } from '../features/bookings/domain/operators';
import { requirementRemedies } from '../features/catalog/domain/remedies';
import type { Requirement, ResortFacts } from '../features/bookings/domain/requirements';

const TODAY = 10;

// Some wishes met and some not, so a voucher shows both ticks.
const FACTS: ResortFacts = {
  needs: new Set(['fun', 'hunger']),
  flags: new Set(['calm', 'stage']),
  lodgingPrices: [60, 90],
  stars: 3.5,
};

type Sample = Pick<Offer, 'kind' | 'parties' | 'nights' | 'requirements'> & {
  readonly lead: number;
};

// Every kind of group, and one too big to draw, across the operators in their listed order.
const SAMPLES: readonly Sample[] = [
  {
    kind: 'family',
    parties: 3,
    lead: 3,
    nights: 5,
    requirements: [{ kind: 'need', value: 'fun' }],
  },
  {
    kind: 'couple',
    parties: 4,
    lead: 4,
    nights: 3,
    requirements: [{ kind: 'flag', value: 'calm' }],
  },
  {
    kind: 'friends',
    parties: 2,
    lead: 3,
    nights: 4,
    requirements: [{ kind: 'flag', value: 'dj' }],
  },
  {
    kind: 'solo',
    parties: 5,
    lead: 5,
    nights: 6,
    requirements: [{ kind: 'flag', value: 'bathing' }],
  },
  {
    kind: 'wedding',
    parties: 4,
    lead: 4,
    nights: 2,
    requirements: [
      { kind: 'flag', value: 'stage' },
      { kind: 'stars', value: 4 },
    ],
  },
  {
    kind: 'family',
    parties: 8,
    lead: 5,
    nights: 7,
    requirements: [{ kind: 'need', value: 'fun' }],
  },
  {
    kind: 'couple',
    parties: 2,
    lead: 3,
    nights: 4,
    requirements: [
      { kind: 'flag', value: 'calm' },
      { kind: 'lodging', value: 120 },
    ],
  },
  { kind: 'friends', parties: 3, lead: 4, nights: 3, requirements: [] },
];

const offerOf = (sample: Sample, index: number, operator: string): Offer => ({
  id: index + 1,
  operator,
  kind: sample.kind,
  parties: sample.parties,
  arrivesOn: TODAY + sample.lead,
  nights: sample.nights,
  premium: 0.2 + (index % 3) * 0.1,
  promisedStars: 3 + (index % 4) * 0.5,
  bonusShare: sample.kind === 'wedding' ? 0.6 : 0.3,
  requirements: sample.requirements,
  expiresOn: TODAY + 1,
});

// An operator from an old save that the list no longer names, to show the fallback mark.
const UNLISTED = 'Old Harbour Tours';

const SAMPLE_OFFERS: readonly Offer[] = [
  ...SAMPLES.map((sample, index) => offerOf(sample, index, OPERATORS[index % OPERATORS.length]!)),
  offerOf(SAMPLES[0]!, SAMPLES.length, UNLISTED),
];

const bookingOf = (offer: Offer, state: Booking['state']): Booking => ({
  ...offer,
  state,
  staying: state === 'staying' ? [1, 2, 3] : [],
  arrived: state === 'staying' ? offer.parties : 0,
  stars: [],
  turnedAway: 0,
  expected: 0,
  unmet: [],
});

const GLOWING: Settlement = {
  id: 99,
  operator: OPERATORS[7]!,
  kind: 'couple',
  parties: 3,
  day: TODAY - 1,
  nights: 5,
  premium: 0.3,
  takings: 3_100,
  bonusShare: 0.4,
  meanStars: 4.3,
  promisedStars: 4,
  bonus: 1_240,
  outcome: 'bonus',
};

// One of each outcome, and the old operator that keeps the fallback mark.
const SETTLEMENTS: readonly Settlement[] = [
  GLOWING,
  {
    ...GLOWING,
    id: 98,
    operator: OPERATORS[1]!,
    kind: 'family',
    parties: 4,
    nights: 7,
    premium: 0.2,
    takings: 6_480,
    bonusShare: 0.3,
    meanStars: 3.6,
    promisedStars: 4,
    bonus: 0,
    outcome: 'missed',
  },
  {
    ...GLOWING,
    id: 97,
    operator: OPERATORS[4]!,
    kind: 'wedding',
    parties: 0,
    nights: 2,
    premium: 0.4,
    takings: 0,
    bonusShare: 0.6,
    meanStars: null,
    promisedStars: 4.5,
    bonus: 0,
    outcome: 'failed',
  },
  {
    ...GLOWING,
    id: 96,
    operator: UNLISTED,
    kind: 'solo',
    parties: 2,
    meanStars: null,
    takings: 1_150,
    bonus: 0,
    outcome: 'missed',
  },
];

const DESK: BookingsState = {
  ...createBookings(),
  open: SAMPLE_OFFERS.slice(0, 2),
  accepted: [
    bookingOf({ ...SAMPLE_OFFERS[2]!, arrivesOn: TODAY - 1 }, 'staying'),
    bookingOf(SAMPLE_OFFERS[4]!, 'booked'),
  ],
  settled: [GLOWING],
};

// As a sandbox game names them: everything unlocked, so every wish has something to build.
const remedies = (requirement: Requirement) => requirementRemedies(requirement, null, 'sandbox');

export const sampleDesk = (): BookingsView => bookingsViewOf(DESK, FACTS, TODAY, remedies);

export const sampleOffers = (): BookingsView =>
  bookingsViewOf({ ...createBookings(), open: SAMPLE_OFFERS }, FACTS, TODAY, remedies);

export const sampleSettlements = (): readonly Settlement[] => SETTLEMENTS;

export const sampleStamped = (): readonly {
  readonly card: OfferCard;
  readonly answer: Answer;
}[] => {
  const [first, second] = sampleOffers().offers;
  return [
    { card: first!, answer: 'confirmed' },
    { card: second!, answer: 'declined' },
  ];
};

const books = (entries: readonly (readonly [Parameters<typeof record>[1], number])[]): Ledger =>
  closeDay(
    entries.reduce(
      (ledger, [reason, amount]) => record(ledger, reason, amount),
      createLedger('tycoon', 18_400),
    ),
  );

export interface SampleDay {
  readonly report: DayReport;
  readonly trend: number | null;
  readonly mode: 'tycoon' | 'sandbox';
}

// A good tycoon day with every line, and a glum sandbox one with the cold end of the thermometer.
export const sampleDays = (): readonly SampleDay[] => [
  {
    report: {
      ...reportOf({
        counts: { ...startDay(TODAY), arrived: 23, left: 17, reviews: 9, reviewStars: 37.8 },
        rating: { stars: 4.1, happiness: 0.81, housed: 0.95, cleanliness: 0.9 },
        present: 64,
        beds: { total: 72, taken: 61 },
        ledger: books([
          ['night', 2_940],
          ['visit', 1_310],
          ['booking', 1_240],
          ['wages', -1_150],
          ['maintenance', -420],
          ['build', -2_600],
        ]),
        thoughts: new Map(),
      }),
      turnedAway: 4,
      welcome: { welcomed: 19, gap: null },
    },
    trend: 0.2,
    mode: 'tycoon',
  },
  {
    report: reportOf({
      counts: { ...startDay(TODAY + 1), arrived: 6, left: 11, reviews: 4, reviewStars: 9.2 },
      rating: { stars: 2.4, happiness: 0.22, housed: 0.7, cleanliness: 0.5 },
      present: 28,
      beds: { total: 40, taken: 26 },
      ledger: books([]),
      thoughts: new Map(),
    }),
    trend: -0.3,
    mode: 'sandbox',
  },
];
