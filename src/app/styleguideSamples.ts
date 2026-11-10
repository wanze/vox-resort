import type { Advice } from '../features/sim/domain/advice';
import type { Demand, Pressure } from '../features/sim/domain/demand';
import type { Review } from '../features/sim/domain/reviews';
import type { TillLine } from '../shared/domain/till';
import type { ShowcaseStats, StatusView, VoicesView } from '../features/hud/domain/views';
import type { RoleTally, StaffTally } from '../features/hud/domain/staffPins';

const DAY = 14;

const adviceOf = (advice: Pick<Advice, 'kind' | 'subject'> & Partial<Advice>): Advice => ({
  weight: 1,
  count: 1,
  at: null,
  need: null,
  ...advice,
});

// One of each tier, so every heading and icon the window can show is on the page.
export const SAMPLE_ADVICE: readonly Advice[] = [
  adviceOf({ kind: 'no-beds', subject: 'Beds', count: 6, weight: 9 }),
  adviceOf({ kind: 'broken', subject: 'Water Slide', at: { tileX: 4, tileZ: 9 }, weight: 6 }),
  adviceOf({ kind: 'underpriced', subject: 'rooms', count: 2, weight: 3 }),
  adviceOf({ kind: 'unvisited', subject: 'Mini Golf', at: { tileX: 12, tileZ: 3 } }),
  adviceOf({ kind: 'weather-closed', subject: 'venues', need: 'fun' }),
];

const reviewOf = (name: string, nights: number, stars: number, extra: Partial<Review>): Review => ({
  party: name.length,
  family: name.split(' ')[1] ?? name,
  partyKind: 'couple',
  name,
  nights,
  stars,
  complaint: null,
  praise: null,
  subject: null,
  ...extra,
});

export const SAMPLE_VOICES: VoicesView = {
  loudest: [
    { kind: 'unwatched', subject: 'Beach', count: 3 },
    { kind: 'enjoyed', subject: 'Beach', count: 11 },
    { kind: 'photo', subject: 'the sea by Oasi Fresca', count: 9 },
    { kind: 'enjoyed', subject: 'Volleyball Court', count: 3 },
    { kind: 'queue-too-long', subject: 'Snack Bar', count: 2 },
  ],
  reviews: [
    reviewOf('Carmen Carvalho', 7, 4, { praise: 'enjoyed', subject: 'Beach' }),
    reviewOf('Tomislav Roca', 4, 2, { complaint: 'queue-too-long', subject: 'Snack Bar' }),
    reviewOf('Mercè Casals', 8, 5, { praise: 'photo', praiseSubject: 'the sunset' }),
  ],
  photos: null,
};

const pressure = (value: number, used: number, places: number, turnedAway = 0): Pressure => ({
  pressure: value,
  used,
  places,
  turnedAway,
});

// From roomy to crowded, so every colour and note of the demand bars shows.
const DEMAND: Demand = {
  lines: {
    beds: pressure(0.9, 585, 598, 14),
    energy: pressure(-0.8, 3, 44),
    hunger: pressure(0.4, 214, 248),
    thirst: pressure(-0.2, 160, 308),
    fun: pressure(-0.6, 120, 524),
    hygiene: pressure(1, 59, 59, 6),
    health: pressure(-1, 0, 20),
  },
  groups: { stay: 'beds', food: 'hunger', fun: 'fun', care: 'hygiene' },
};

const tally = (working: number, walking: number, idle: number): RoleTally => ({
  working,
  walking,
  idle,
});

const STAFF_TALLY: StaffTally = {
  cleaner: tally(1, 1, 0),
  lifeguard: tally(1, 0, 0),
  animator: tally(0, 0, 2),
  mechanic: tally(0, 0, 0),
};

export const SAMPLE_STATUS: StatusView = {
  day: DAY,
  rating: { stars: 4.7, happiness: 0.95, housed: 1, cleanliness: 0.82 },
  stepFree: { reached: 9, venues: 11 },
  present: 13,
  beds: { total: 24, taken: 13 },
  demand: DEMAND,
  staff: STAFF_TALLY,
  prestige: null,
};

export const SAMPLE_STAFF: ShowcaseStats['staff'] = {
  total: 5,
  working: 2,
  roster: { cleaner: 2, lifeguard: 1, animator: 2, mechanic: 0 },
  recommended: { cleaner: 3, lifeguard: 1, animator: 1, mechanic: 1 },
  hiring: { cleaner: null, lifeguard: 1, animator: null, mechanic: null },
  zones: [
    { cleaner: 1, lifeguard: 0, animator: 0, mechanic: 0 },
    { cleaner: 1, lifeguard: 1, animator: 0, mechanic: 0 },
    { cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 },
    { cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 },
  ],
};

export const SAMPLE_TALLY = STAFF_TALLY;

export const SAMPLE_TILL: readonly TillLine[] = [
  { label: '4 nights × +25%', note: '1 couple', amount: '220' },
  { label: 'Bonus 30%', note: 'promise kept', amount: '+66', tone: 'good' },
  { label: 'Penalty', note: 'no stage', amount: '−40', tone: 'bad' },
  { label: 'Total', amount: '246', total: true },
];
