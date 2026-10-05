import type { GameMode } from '../../sim/domain/ledger';
import type { Venue } from '../../sim/domain/venues';
import type { Weather } from '../../sim/domain/weather';
import { expectedAudience, type PartyMix } from './audience';
import {
  drawOf,
  EVENT_KIND_IDS,
  EVENT_KINDS,
  feeOf,
  labelOf,
  type EventKind,
  type EventKindId,
} from './catalogue';
import {
  nextEvents,
  occurrencesOn,
  occursOn,
  siteKey,
  type EventSite,
  type Occurrence,
  type Programme,
  type Repeat,
} from './programme';
import { sitesOf } from './sites';
import {
  clockWords,
  dayAt,
  dayWords,
  minuteOf,
  START_STEP,
  WEEKDAY_NAMES,
  weekdayOf,
} from './week';

export const DAY_PARTS = ['morning', 'afternoon', 'evening'] as const;

export type DayPart = (typeof DAY_PARTS)[number];

const PART_HOURS: { readonly [part in DayPart]: { readonly from: number; readonly to: number } } = {
  morning: { from: 0, to: 12 * 60 },
  afternoon: { from: 12 * 60, to: 18 * 60 },
  evening: { from: 18 * 60, to: 24 * 60 },
};

const DAYS_SHOWN = 7;

const UPCOMING = 5;

export interface DayForecast {
  readonly day: number;
  readonly weather: Weather;
  readonly pinned: boolean;
}

export interface ProgrammeFacts {
  readonly programme: Programme;
  readonly stages: readonly Venue[];
  // Absolute ticks.
  readonly now: number;
  readonly mode: GameMode;
  readonly balance: number;
  // From today, one a day.
  readonly forecast: readonly DayForecast[];
  readonly mix: PartyMix;
  readonly animators: number;
  // People the owned sand holds for a show; 0 with no beach, or no way onto it.
  readonly beachRoom: number;
}

export interface SiteTab {
  readonly key: string;
  readonly site: EventSite;
  readonly label: string;
  readonly capacity: number;
}

export interface Chip {
  readonly booking: number;
  readonly minute: number;
  readonly time: string;
  readonly label: string;
  readonly repeat: string;
  readonly builtIn: boolean;
  readonly off: boolean;
}

export interface RepeatChoice {
  readonly words: string;
  readonly repeat: Repeat;
}

export interface DayColumn {
  readonly day: number;
  readonly name: string;
  // Once that day, every week on its weekday, or every day.
  readonly repeats: readonly RepeatChoice[];
  readonly weather: Weather | null;
  readonly pinned: boolean;
  readonly parts: { readonly [part in DayPart]: readonly Chip[] };
}

export interface StartChoice {
  readonly minute: number;
  readonly words: string;
}

export interface TierChoice {
  readonly id: string;
  readonly label: string;
  readonly fee: string;
  readonly audience: number;
  readonly warning: string | null;
}

export interface Card {
  readonly kind: EventKindId;
  readonly label: string;
  readonly blurb: string;
  readonly host: string;
  readonly fee: string;
  readonly audience: number;
  readonly starts: readonly StartChoice[];
  readonly warning: string | null;
  // Absent for a kind that comes in one size; booked with the middle one unless another is chosen.
  readonly tiers?: readonly TierChoice[];
}

export interface Upcoming {
  readonly key: string;
  readonly when: string;
  readonly label: string;
  readonly site: string;
}

export interface ProgrammeView {
  readonly sites: readonly SiteTab[];
  // Null with no stage on the plot.
  readonly site: SiteTab | null;
  readonly days: readonly DayColumn[];
  readonly cards: { readonly [part in DayPart]: readonly Card[] };
  readonly upcoming: readonly Upcoming[];
}

const KINDS: readonly EventKind[] = EVENT_KIND_IDS.map((id) => EVENT_KINDS[id]);

export function repeatWords(repeat: Repeat): string {
  if (repeat.every === 'day') return 'Every day';
  if (repeat.every === 'week') return `Every ${WEEKDAY_NAMES[repeat.weekday]}`;
  return 'Once';
}

const partOf = (minute: number): DayPart =>
  DAY_PARTS.findLast((part) => minute >= PART_HOURS[part].from) ?? 'morning';

// Switched-off bookings too, so a built-in can be switched back on from its day.
function chipsOn(programme: Programme, key: string, day: number): readonly Chip[] {
  return programme.bookings
    .filter((booking) => siteKey(booking.site) === key && occursOn(booking.repeat, day))
    .toSorted((a, b) => a.start - b.start || a.id - b.id)
    .map((booking) => ({
      booking: booking.id,
      minute: booking.start,
      time: clockWords(booking.start),
      label: labelOf(EVENT_KINDS[booking.kind], booking.tier),
      repeat: repeatWords(booking.repeat),
      builtIn: booking.builtIn !== undefined,
      off: booking.off === true,
    }));
}

function startsIn(kind: EventKind, part: DayPart): readonly StartChoice[] {
  const { from, to } = PART_HOURS[part];
  const starts: StartChoice[] = [];
  for (
    let minute = Math.max(kind.earliest, from);
    minute <= kind.latest && minute < to;
    minute += START_STEP
  ) {
    starts.push({ minute, words: clockWords(minute) });
  }
  return starts;
}

function feeWords(fee: number): string {
  return fee > 0 ? `${fee.toLocaleString('en-US')} a show` : 'Free';
}

const hostMissing = (kind: EventKind, facts: ProgrammeFacts): boolean =>
  kind.host === 'animator' && facts.animators <= 0;

const tooDear = (kind: EventKind, tier: string | undefined, facts: ProgrammeFacts): boolean =>
  facts.mode === 'tycoon' && feeOf(kind, tier, facts.mode) > facts.balance;

function warningFor(
  kind: EventKind,
  facts: ProgrammeFacts,
  tier: string | undefined = undefined,
): string | null {
  if (hostMissing(kind, facts)) return 'No animator on duty';
  return tooDear(kind, tier, facts) ? 'Not enough money' : null;
}

function tiersOf(kind: EventKind, facts: ProgrammeFacts, capacity: number): readonly TierChoice[] {
  return (kind.tiers ?? []).map((tier) => ({
    id: tier.id,
    label: tier.label,
    fee: feeWords(feeOf(kind, tier.id, facts.mode)),
    audience: expectedAudience(kind, facts.mix, capacity, drawOf(kind, tier.id)),
    warning: warningFor(kind, facts, tier.id),
  }));
}

function cardOf(
  kind: EventKind,
  starts: readonly StartChoice[],
  facts: ProgrammeFacts,
  capacity: number,
): Card {
  const tiers = tiersOf(kind, facts, capacity);
  return {
    kind: kind.id,
    starts,
    label: kind.label,
    blurb: kind.blurb,
    host: kind.host === 'animator' ? 'Hosted by an animator' : 'A visiting act',
    fee: feeWords(feeOf(kind, undefined, facts.mode)),
    audience: expectedAudience(kind, facts.mix, capacity),
    warning: warningFor(kind, facts),
    ...(tiers.length > 0 ? { tiers } : {}),
  };
}

function cardsFor(facts: ProgrammeFacts, site: SiteTab | null, part: DayPart): readonly Card[] {
  if (!site) return [];
  return KINDS.filter((kind) => kind.builtIn !== true && kind.sites.includes(site.site.kind))
    .map((kind) => ({ kind, starts: startsIn(kind, part) }))
    .filter(({ starts }) => starts.length > 0)
    .map(({ kind, starts }) => cardOf(kind, starts, facts, site.capacity));
}

function upcomingOf(facts: ProgrammeFacts, tabs: readonly SiteTab[]): readonly Upcoming[] {
  const labels = new Map(tabs.map((tab) => [tab.key, tab.label]));
  return nextEvents(facts.programme, facts.now, UPCOMING).map((each: Occurrence) => ({
    key: `${each.booking}:${each.day}`,
    when: `${dayWords(each.day)} ${clockWords(minuteOf(each.start))}`,
    label: labelOf(EVENT_KINDS[each.kind], each.tier),
    site: labels.get(siteKey(each.site)) ?? 'nowhere',
  }));
}

const BEACH_LABEL = 'Beach';

// The beach after the stages, as sitesOf lists it, holding as many as the sand does.
function tabsOf(stages: readonly Venue[], beachRoom: number): readonly SiteTab[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  return sitesOf(stages, KINDS, beachRoom > 0).flatMap((site): SiteTab[] => {
    const key = siteKey(site);
    if (site.kind === 'beach') return [{ key, site, label: BEACH_LABEL, capacity: beachRoom }];
    const stage = byKey.get(key);
    return stage ? [{ key, site, label: stage.label, capacity: stage.capacity }] : [];
  });
}

const chosenTab = (tabs: readonly SiteTab[], chosen: string | null): SiteTab | null =>
  tabs.find((tab) => tab.key === chosen) ?? tabs[0] ?? null;

function repeatsFrom(day: number): readonly RepeatChoice[] {
  const repeats: readonly Repeat[] = [
    { every: 'once', day },
    { every: 'week', weekday: weekdayOf(day) },
    { every: 'day' },
  ];
  return repeats.map((repeat) => ({ words: repeatWords(repeat), repeat }));
}

const UNKNOWN_WEATHER = { weather: null, pinned: false } as const;

function dayColumn(
  programme: Programme,
  key: string,
  day: number,
  forecast: ReadonlyMap<number, DayForecast>,
): DayColumn {
  const chips = chipsOn(programme, key, day);
  const { weather, pinned } = forecast.get(day) ?? UNKNOWN_WEATHER;
  return {
    day,
    name: dayWords(day),
    repeats: repeatsFrom(day),
    weather,
    pinned,
    parts: {
      morning: chips.filter((chip) => partOf(chip.minute) === 'morning'),
      afternoon: chips.filter((chip) => partOf(chip.minute) === 'afternoon'),
      evening: chips.filter((chip) => partOf(chip.minute) === 'evening'),
    },
  };
}

// `chosen` is a site key; one no longer standing falls back to the first stage.
export function programmeView(facts: ProgrammeFacts, chosen: string | null): ProgrammeView {
  const sites = tabsOf(facts.stages, facts.beachRoom);
  const site = chosenTab(sites, chosen);
  // No booking sits on the empty key, so a plot with no stage shows an empty week.
  const key = site ? site.key : '';
  const today = dayAt(facts.now);
  const forecast = new Map(facts.forecast.map((each) => [each.day, each]));
  return {
    sites,
    site,
    days: Array.from({ length: DAYS_SHOWN }, (_, offset) =>
      dayColumn(facts.programme, key, today + offset, forecast),
    ),
    cards: {
      morning: cardsFor(facts, site, 'morning'),
      afternoon: cardsFor(facts, site, 'afternoon'),
      evening: cardsFor(facts, site, 'evening'),
    },
    upcoming: upcomingOf(facts, sites),
  };
}

// For the inspector: the next event on one stage within the week shown.
export function nextAt(programme: Programme, key: string, now: number): string | null {
  const today = dayAt(now);
  for (let day = today; day < today + DAYS_SHOWN; day++) {
    const next = occurrencesOn(programme, day).find(
      (each) => siteKey(each.site) === key && each.start >= now,
    );
    if (next)
      return `${dayName(day, today)} ${clockWords(next.start)}: ${EVENT_KINDS[next.kind].label}`;
  }
  return null;
}

const dayName = (day: number, today: number): string => (day === today ? 'Today' : dayWords(day));
