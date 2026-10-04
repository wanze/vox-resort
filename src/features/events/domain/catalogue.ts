import type { PartyKind } from '../../guests/domain/parties';
import type { GameMode } from '../../sim/domain/ledger';
import type { ThoughtKind } from '../../sim/domain/thoughts';

export const EVENT_KIND_IDS = [
  'live-music',
  'dance-night',
  'musical',
  'kids-show',
  'quiz-night',
  'cinema',
  'kids-games',
  'painting',
  'puppet-show',
  'bingo',
  'afternoon-jazz',
  'welcome',
] as const;

export type EventKindId = (typeof EVENT_KIND_IDS)[number];

export type SiteKind = 'stage' | 'beach';

export type EventHost = 'animator' | 'performer';

// 'shelter' moves the day's run to another stage open in the weather.
export type WeatherRule = 'cancel' | 'postpone' | 'shelter';

export interface EventTier {
  readonly id: string;
  readonly label: string;
  readonly fee: number;
  readonly lift: number;
  // Multiplies the appeal.
  readonly draw: number;
}

export interface AudienceParty {
  readonly party: number;
  readonly kind: PartyKind;
  readonly people: number;
  readonly children: number;
  readonly arrivedOn: number;
}

export interface EventKind {
  readonly id: EventKindId;
  readonly label: string;
  readonly blurb: string;
  readonly sites: readonly SiteKind[];
  // In minutes; the starts are minutes of the day.
  readonly duration: number;
  readonly earliest: number;
  readonly latest: number;
  readonly start: number;
  readonly host: EventHost;
  // Per show, tycoon only; a tier's fee replaces it, as a tier's lift replaces `lift`.
  readonly fee: number;
  readonly appeal: { readonly [kind in PartyKind]: number };
  readonly openAir: boolean;
  readonly weather: WeatherRule;
  // Per hour, while inside and running.
  readonly fun: number;
  readonly lift: number;
  readonly litter: number;
  readonly praise: ThoughtKind;
  readonly tiers?: readonly EventTier[];
  readonly audience?: (party: AudienceParty, day: number) => boolean;
  // `timesBefore` is the guest's stayCount of the praise thought.
  readonly novelty?: (timesBefore: number) => number;
  // Never offered as a card; comes from BUILT_INS.
  readonly builtIn?: boolean;
  // Invites the newly arrived while it is announced or running, not only twice.
  readonly latecomers?: boolean;
}

const HOUR = 60;

// Past this an audience is kept up beyond any bedtime and wakes tired.
const LATE_FROM = 22 * HOUR;

export const EVENT_KINDS: { readonly [id in EventKindId]: EventKind } = {
  'live-music': {
    id: 'live-music',
    label: 'Live music',
    blurb: 'A band plays covers and a few of their own songs.',
    sites: ['stage'],
    duration: 1.5 * HOUR,
    earliest: 18 * HOUR,
    latest: 21.5 * HOUR,
    start: 20 * HOUR,
    host: 'performer',
    fee: 150,
    appeal: { family: 0.4, couple: 0.7, friends: 0.8, solo: 0.6 },
    openAir: false,
    weather: 'cancel',
    fun: 0.4,
    lift: 0.08,
    litter: 0.3,
    praise: 'great-show',
  },
  'dance-night': {
    id: 'dance-night',
    label: 'Dance night',
    blurb: 'An animator plays the hits and gets everybody dancing.',
    sites: ['stage'],
    duration: 2 * HOUR,
    earliest: 20 * HOUR,
    latest: 22 * HOUR,
    start: 21 * HOUR,
    host: 'animator',
    fee: 0,
    appeal: { family: 0.2, couple: 0.6, friends: 0.9, solo: 0.5 },
    openAir: false,
    weather: 'cancel',
    fun: 0.5,
    lift: 0.08,
    litter: 0.35,
    praise: 'great-show',
  },
  musical: {
    id: 'musical',
    label: 'Musical',
    blurb: 'A touring company sings its way through a whole story.',
    sites: ['stage'],
    duration: 2 * HOUR,
    earliest: 18 * HOUR,
    latest: 20.5 * HOUR,
    start: 19 * HOUR,
    host: 'performer',
    fee: 300,
    appeal: { family: 0.7, couple: 0.6, friends: 0.4, solo: 0.5 },
    openAir: false,
    weather: 'cancel',
    fun: 0.4,
    lift: 0.12,
    litter: 0.2,
    praise: 'great-show',
  },
  'kids-show': {
    id: 'kids-show',
    label: 'Magic show',
    blurb: 'Cards, coins and a rabbit, for the children.',
    sites: ['stage'],
    duration: 1 * HOUR,
    earliest: 14 * HOUR,
    latest: 18 * HOUR,
    start: 16 * HOUR,
    host: 'animator',
    fee: 0,
    appeal: { family: 0.9, couple: 0.1, friends: 0.1, solo: 0.1 },
    openAir: false,
    weather: 'cancel',
    fun: 0.6,
    lift: 0.06,
    litter: 0.3,
    praise: 'great-show',
    audience: (party) => party.children > 0,
  },
  'quiz-night': {
    id: 'quiz-night',
    label: 'Quiz night',
    blurb: 'Teams, a microphone and questions nobody knows the answer to.',
    sites: ['stage'],
    duration: 1.5 * HOUR,
    earliest: 19 * HOUR,
    latest: 21 * HOUR,
    start: 20 * HOUR,
    host: 'animator',
    fee: 0,
    appeal: { family: 0.4, couple: 0.5, friends: 0.7, solo: 0.6 },
    openAir: false,
    weather: 'cancel',
    fun: 0.3,
    lift: 0.06,
    litter: 0.15,
    praise: 'great-show',
  },
  // Starts at sunset (SUNSET_TIME, 21:30): a screen needs the dark.
  cinema: {
    id: 'cinema',
    label: 'Open-air cinema',
    blurb: 'A film under the stars, with deckchairs and popcorn.',
    sites: ['stage'],
    duration: 2 * HOUR,
    earliest: 21.5 * HOUR,
    latest: 22 * HOUR,
    start: 21.5 * HOUR,
    host: 'performer',
    fee: 100,
    appeal: { family: 0.5, couple: 0.7, friends: 0.5, solo: 0.4 },
    openAir: true,
    weather: 'cancel',
    fun: 0.3,
    lift: 0.08,
    litter: 0.3,
    praise: 'great-show',
  },
  'kids-games': {
    id: 'kids-games',
    label: "Kids' games",
    blurb: 'Sack races, a treasure hunt and tug of war, run by an animator.',
    sites: ['stage'],
    duration: 1.5 * HOUR,
    earliest: 13 * HOUR,
    latest: 16.5 * HOUR,
    start: 14 * HOUR,
    host: 'animator',
    fee: 0,
    appeal: { family: 0.9, couple: 0.05, friends: 0.05, solo: 0.05 },
    openAir: false,
    weather: 'cancel',
    fun: 0.6,
    lift: 0.05,
    litter: 0.2,
    praise: 'great-show',
    audience: (party) => party.children > 0,
  },
  // The fee is the paint and paper; the animator is on the payroll already.
  painting: {
    id: 'painting',
    label: 'Painting club',
    blurb: 'Brushes, paper and a lot of colour; the pictures go home with the children.',
    sites: ['stage'],
    duration: 1 * HOUR,
    earliest: 13 * HOUR,
    latest: 17 * HOUR,
    start: 15 * HOUR,
    host: 'animator',
    fee: 40,
    appeal: { family: 0.8, couple: 0.05, friends: 0.05, solo: 0.05 },
    openAir: false,
    weather: 'cancel',
    fun: 0.5,
    lift: 0.06,
    litter: 0.25,
    praise: 'great-show',
    audience: (party) => party.children > 0,
  },
  'puppet-show': {
    id: 'puppet-show',
    label: 'Puppet theatre',
    blurb: 'A travelling puppeteer with a dragon, a knight and a lot of shouting.',
    sites: ['stage'],
    duration: 1 * HOUR,
    earliest: 14 * HOUR,
    latest: 17.5 * HOUR,
    start: 16 * HOUR,
    host: 'performer',
    fee: 120,
    appeal: { family: 0.9, couple: 0.15, friends: 0.1, solo: 0.1 },
    openAir: false,
    weather: 'cancel',
    fun: 0.5,
    lift: 0.07,
    litter: 0.25,
    praise: 'great-show',
  },
  bingo: {
    id: 'bingo',
    label: 'Bingo',
    blurb: 'Cards, a tumbler of balls and a prize for every full house.',
    sites: ['stage'],
    duration: 1 * HOUR,
    earliest: 14 * HOUR,
    latest: 17 * HOUR,
    start: 16 * HOUR,
    host: 'animator',
    fee: 0,
    appeal: { family: 0.3, couple: 0.6, friends: 0.5, solo: 0.6 },
    openAir: false,
    weather: 'cancel',
    fun: 0.3,
    lift: 0.05,
    litter: 0.15,
    praise: 'great-show',
  },
  'afternoon-jazz': {
    id: 'afternoon-jazz',
    label: 'Afternoon jazz',
    blurb: 'A trio plays standards while the sun goes round.',
    sites: ['stage'],
    duration: 1.5 * HOUR,
    earliest: 14 * HOUR,
    latest: 17 * HOUR,
    start: 15 * HOUR,
    host: 'performer',
    fee: 120,
    appeal: { family: 0.2, couple: 0.7, friends: 0.4, solo: 0.6 },
    openAir: false,
    weather: 'cancel',
    fun: 0.3,
    lift: 0.07,
    litter: 0.2,
    praise: 'great-show',
  },
  // The morning after arriving, when few are hungry or already settled somewhere. It ends by the
  // 11:00 check-in, which closes the day the guests arrived on, so the report counts them together.
  welcome: {
    id: 'welcome',
    label: 'Welcome meeting',
    blurb: "An animator greets yesterday's new guests with a coffee and the week's programme.",
    sites: ['stage'],
    duration: 1 * HOUR,
    earliest: 8 * HOUR,
    latest: 10 * HOUR,
    start: 10 * HOUR,
    host: 'animator',
    fee: 0,
    appeal: { family: 0.9, couple: 0.85, friends: 0.8, solo: 0.85 },
    openAir: false,
    weather: 'shelter',
    fun: 0.3,
    lift: 0.1,
    litter: 0.25,
    praise: 'welcomed',
    audience: (party, day) => party.arrivedOn === day - 1,
    builtIn: true,
    latecomers: true,
  },
};

export function isEventKind(value: string): value is EventKindId {
  return (EVENT_KIND_IDS as readonly string[]).includes(value);
}

const tierOf = (kind: EventKind, tier: string | undefined): EventTier | undefined =>
  tier === undefined ? undefined : kind.tiers?.find((each) => each.id === tier);

export function feeOf(kind: EventKind, tier: string | undefined, mode: GameMode): number {
  if (mode === 'sandbox') return 0;
  return tierOf(kind, tier)?.fee ?? kind.fee;
}

export function drawOf(kind: EventKind, tier: string | undefined): number {
  return tierOf(kind, tier)?.draw ?? 1;
}

export function liftFor(kind: EventKind, tier: string | undefined, timesBefore: number): number {
  return (tierOf(kind, tier)?.lift ?? kind.lift) * (kind.novelty?.(timesBefore) ?? 1);
}

export function runsLate(kind: EventKind, start: number): boolean {
  return start + kind.duration > LATE_FROM;
}
