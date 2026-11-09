import {
  createBookings,
  type Booking,
  type BookingsState,
} from '../features/bookings/domain/bookings';
import { bookingsViewOf, type BookingsView } from '../features/bookings/domain/bookingsView';
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

const DESK: BookingsState = {
  ...createBookings(),
  open: SAMPLE_OFFERS.slice(0, 2),
  accepted: [
    bookingOf({ ...SAMPLE_OFFERS[2]!, arrivesOn: TODAY - 1 }, 'staying'),
    bookingOf(SAMPLE_OFFERS[4]!, 'booked'),
  ],
  settled: [
    {
      id: 99,
      operator: OPERATORS[7]!,
      kind: 'couple',
      parties: 3,
      day: TODAY - 1,
      meanStars: 4.3,
      promisedStars: 4,
      bonus: 1_240,
      outcome: 'bonus',
    },
  ],
};

// As a sandbox game names them: everything unlocked, so every wish has something to build.
const remedies = (requirement: Requirement) => requirementRemedies(requirement, null, 'sandbox');

export const sampleDesk = (): BookingsView => bookingsViewOf(DESK, FACTS, TODAY, remedies);

export const sampleOffers = (): BookingsView =>
  bookingsViewOf({ ...createBookings(), open: SAMPLE_OFFERS }, FACTS, TODAY, remedies);
