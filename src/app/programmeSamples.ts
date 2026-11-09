import { EVENT_KINDS } from '../features/events/domain/catalogue';
import type { PosterDay } from '../features/events/domain/poster';
import {
  book,
  BUILT_INS,
  EMPTY_PROGRAMME,
  withBuiltIns,
  type BookingDraft,
  type Programme,
} from '../features/events/domain/programme';
import {
  cardsAt,
  DAY_PARTS,
  programmeView,
  type Card,
  type ProgrammeFacts,
} from '../features/events/domain/programmeView';
import { tickAt, type Weekday } from '../features/events/domain/week';
import type { Weather } from '../features/sim/domain/weather';
import type { Venue } from '../features/sim/domain/venues';

const HOUR = 60;

// A Thursday, so the week runs over a weekend.
const TODAY = 10;

const stage = (key: string, label: string, capacity: number, welcomes = false): Venue => ({
  key,
  id: key.split('#')[0]!,
  label,
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.5 }],
  capacity,
  dwellSeconds: { min: 60, max: 120 },
  stage: true,
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 2,
  tilesZ: 2,
  doors: [],
  ...(welcomes ? { welcomes } : {}),
});

const CORAL = 'beach-club#0';
const KIDS = 'kids-club#0';

const STAGES = [stage(CORAL, 'Coral Stage', 40, true), stage(KIDS, 'Kids club', 20)];

const weekly = (weekday: Weekday) => ({ every: 'week', weekday }) as const;

// Every category somewhere in the week, some daily and some once, on all three sites.
const BOOKINGS: readonly BookingDraft[] = [
  { kind: 'bingo', site: { kind: 'stage', venue: CORAL }, repeat: weekly(1), start: 14 * HOUR },
  {
    kind: 'afternoon-jazz',
    site: { kind: 'stage', venue: CORAL },
    repeat: weekly(6),
    start: 15 * HOUR,
  },
  { kind: 'musical', site: { kind: 'stage', venue: CORAL }, repeat: weekly(2), start: 18 * HOUR },
  {
    kind: 'quiz-night',
    site: { kind: 'stage', venue: CORAL },
    repeat: weekly(0),
    start: 19.5 * HOUR,
  },
  {
    kind: 'live-music',
    site: { kind: 'stage', venue: CORAL },
    repeat: weekly(4),
    start: 20 * HOUR,
  },
  {
    kind: 'dance-night',
    site: { kind: 'stage', venue: CORAL },
    repeat: weekly(5),
    start: 21 * HOUR,
  },
  { kind: 'cinema', site: { kind: 'stage', venue: CORAL }, repeat: weekly(3), start: 21.5 * HOUR },
  {
    kind: 'kids-show',
    site: { kind: 'stage', venue: KIDS },
    repeat: { every: 'day' },
    start: 15 * HOUR,
  },
  { kind: 'painting', site: { kind: 'stage', venue: KIDS }, repeat: weekly(0), start: 13 * HOUR },
  { kind: 'kids-games', site: { kind: 'stage', venue: KIDS }, repeat: weekly(3), start: 13 * HOUR },
  {
    kind: 'puppet-show',
    site: { kind: 'stage', venue: KIDS },
    repeat: weekly(5),
    start: 16.5 * HOUR,
  },
  { kind: 'bonfire', site: { kind: 'beach' }, repeat: weekly(1), start: 20 * HOUR },
  { kind: 'bonfire', site: { kind: 'beach' }, repeat: weekly(4), start: 20 * HOUR },
  {
    kind: 'fireworks',
    site: { kind: 'beach' },
    repeat: weekly(2),
    start: 22.5 * HOUR,
    tier: 'small',
  },
  {
    kind: 'fireworks',
    site: { kind: 'beach' },
    repeat: { every: 'once', day: TODAY + 2 },
    start: 22 * HOUR,
    tier: 'grand',
  },
];

// The welcome is first, as a new game's is, so the rest are booked round it.
const PROGRAMME: Programme = BOOKINGS.reduce(
  (programme, draft) => book(programme, draft, 0).programme,
  withBuiltIns(EMPTY_PROGRAMME, BUILT_INS, [{ kind: 'stage', venue: CORAL }]),
);

const SKIES: readonly Weather[] = ['clear', 'clear', 'heatwave', 'rain', 'storm', 'clear'];

// Mid-afternoon, so the morning's events on today's column are already struck off.
const FACTS: ProgrammeFacts = {
  programme: PROGRAMME,
  stages: STAGES,
  now: tickAt(TODAY, 16 * HOUR),
  mode: 'tycoon',
  balance: 1_000,
  forecast: SKIES.map((weather, offset) => ({ day: TODAY + offset, weather, pinned: offset < 2 })),
  mix: {
    family: { people: 40, withChildren: 40 },
    couple: { people: 30, withChildren: 0 },
    friends: { people: 20, withChildren: 0 },
    solo: { people: 10, withChildren: 0 },
  },
  animators: 2,
  beachRoom: 80,
  fireRoom: 24,
};

export interface FlyerSheet {
  readonly stage: string;
  readonly cards: readonly Card[];
}

// The welcome is a built-in and never offered, so its flyer is drawn from the catalogue.
const WELCOME: Card = {
  kind: 'welcome',
  label: EVENT_KINDS.welcome.label,
  blurb: EVENT_KINDS.welcome.blurb,
  host: 'Hosted by an animator',
  fee: 'Free',
  audience: 24,
  warning: null,
  starts: [
    {
      minute: 10 * HOUR,
      words: '10:00',
      repeats: [{ words: 'Every day', repeat: { every: 'day' }, refusal: null }],
    },
  ],
};

// Tomorrow on an empty programme, so every kind has a start free; each kind once, on its first site.
export function sampleFlyers(): readonly FlyerSheet[] {
  const facts = { ...FACTS, programme: EMPTY_PROGRAMME };
  const seen = new Set<string>();
  const sheets = programmeView(facts, null).sites.map((site) => ({
    stage: site.label,
    cards: DAY_PARTS.flatMap((part) => cardsAt(facts, site, TODAY + 1, part)).filter((card) => {
      const fresh = !seen.has(card.kind);
      seen.add(card.kind);
      return fresh;
    }),
  }));
  const booked = sheets[0]!.cards[0]!;
  return [
    ...sheets.filter((sheet) => sheet.cards.length > 0),
    { stage: STAGES[0]!.label, cards: [WELCOME, { ...booked, starts: [] }] },
  ];
}

export const samplePoster = (): readonly PosterDay[] => programmeView(FACTS, null).poster;
