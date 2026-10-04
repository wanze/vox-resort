import type { GameMode } from '../../sim/domain/ledger';
import type { Venue } from '../../sim/domain/venues';
import type { Weather } from '../../sim/domain/weather';
import { expectedAudience, type PartyMix } from './audience';
import { EVENT_KIND_IDS, EVENT_KINDS, feeOf, type EventKind, type EventKindId } from './catalogue';
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

export type DayPart = 'afternoon' | 'evening';

const PART_HOURS: { readonly [part in DayPart]: { readonly from: number; readonly to: number } } = {
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

export interface Card {
  readonly kind: EventKindId;
  readonly label: string;
  readonly blurb: string;
  readonly host: string;
  readonly fee: string;
  readonly audience: number;
  readonly starts: readonly StartChoice[];
  readonly warning: string | null;
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
  minute >= PART_HOURS.evening.from ? 'evening' : 'afternoon';

// Switched-off bookings too, so a built-in can be switched back on from its day.
function chipsOn(programme: Programme, key: string, day: number): readonly Chip[] {
  return programme.bookings
    .filter((booking) => siteKey(booking.site) === key && occursOn(booking.repeat, day))
    .toSorted((a, b) => a.start - b.start || a.id - b.id)
    .map((booking) => ({
      booking: booking.id,
      minute: booking.start,
      time: clockWords(booking.start),
      label: EVENT_KINDS[booking.kind].label,
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

const tooDear = (kind: EventKind, facts: ProgrammeFacts): boolean =>
  facts.mode === 'tycoon' && feeOf(kind, undefined, facts.mode) > facts.balance;

function warningFor(kind: EventKind, facts: ProgrammeFacts): string | null {
  if (hostMissing(kind, facts)) return 'No animator on duty';
  return tooDear(kind, facts) ? 'Not enough money' : null;
}

function cardsFor(facts: ProgrammeFacts, capacity: number, part: DayPart): readonly Card[] {
  return KINDS.filter((kind) => kind.builtIn !== true && kind.sites.includes('stage'))
    .map((kind) => ({ kind, starts: startsIn(kind, part) }))
    .filter(({ starts }) => starts.length > 0)
    .map(({ kind, starts }) => ({
      kind: kind.id,
      label: kind.label,
      blurb: kind.blurb,
      host: kind.host === 'animator' ? 'Hosted by an animator' : 'A visiting act',
      fee: feeWords(feeOf(kind, undefined, facts.mode)),
      audience: expectedAudience(kind, facts.mix, capacity),
      starts,
      warning: warningFor(kind, facts),
    }));
}

function upcomingOf(facts: ProgrammeFacts, tabs: readonly SiteTab[]): readonly Upcoming[] {
  const labels = new Map(tabs.map((tab) => [tab.key, tab.label]));
  return nextEvents(facts.programme, facts.now, UPCOMING).map((each: Occurrence) => ({
    key: `${each.booking}:${each.day}`,
    when: `${dayWords(each.day)} ${clockWords(minuteOf(each.start))}`,
    label: EVENT_KINDS[each.kind].label,
    site: labels.get(siteKey(each.site)) ?? 'nowhere',
  }));
}

function tabsOf(stages: readonly Venue[]): readonly SiteTab[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  return sitesOf(stages, KINDS, false).flatMap((site) => {
    const stage = byKey.get(siteKey(site));
    return stage ? [{ key: stage.key, site, label: stage.label, capacity: stage.capacity }] : [];
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
      afternoon: chips.filter((chip) => partOf(chip.minute) === 'afternoon'),
      evening: chips.filter((chip) => partOf(chip.minute) === 'evening'),
    },
  };
}

// `chosen` is a site key; one no longer standing falls back to the first stage.
export function programmeView(facts: ProgrammeFacts, chosen: string | null): ProgrammeView {
  const sites = tabsOf(facts.stages);
  const site = chosenTab(sites, chosen);
  // No booking sits on the empty key, so a plot with no stage shows an empty week.
  const key = site ? site.key : '';
  const capacity = site ? site.capacity : 0;
  const today = dayAt(facts.now);
  const forecast = new Map(facts.forecast.map((each) => [each.day, each]));
  return {
    sites,
    site,
    days: Array.from({ length: DAYS_SHOWN }, (_, offset) =>
      dayColumn(facts.programme, key, today + offset, forecast),
    ),
    cards: {
      afternoon: cardsFor(facts, capacity, 'afternoon'),
      evening: cardsFor(facts, capacity, 'evening'),
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
