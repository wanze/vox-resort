import { familyOf, signOf, type SignKind } from '../../catalog/domain/objectTypes';
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
  bookingRefusal,
  nextEvents,
  occurrencesOn,
  occursOn,
  rebook,
  siteKey,
  switchBuiltIn,
  type BookingRefusal,
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

// A week of a busy resort's events, which the list's filters then narrow down.
const UPCOMING = 120;

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
  // A SiteType key: the stage's family, or the beach.
  readonly type: string;
}

// Stages of one kind, so a resort with many can be picked from by kind first.
export interface SiteType {
  readonly key: string;
  readonly label: string;
  // Null for the beach, which has no sign.
  readonly sign: SignKind | null;
  readonly sites: readonly SiteTab[];
}

export interface Chip {
  readonly booking: number;
  readonly minute: number;
  readonly time: string;
  readonly label: string;
  readonly repeat: string;
  readonly builtIn: boolean;
  readonly off: boolean;
  // Whether a step either way, or switching a built-in back on, would be taken.
  readonly earlier: boolean;
  readonly later: boolean;
  readonly canSwitch: boolean;
}

export interface RepeatChoice {
  readonly words: string;
  readonly repeat: Repeat;
  readonly refusal: BookingRefusal | null;
}

export interface DayColumn {
  readonly day: number;
  readonly name: string;
  readonly weather: Weather | null;
  readonly pinned: boolean;
  readonly parts: { readonly [part in DayPart]: readonly Chip[] };
  // Whether anything at all can still be booked then.
  readonly open: { readonly [part in DayPart]: boolean };
}

// Only starts at least one repeat can be booked at; the repeats say why the others cannot.
export interface StartChoice {
  readonly minute: number;
  readonly words: string;
  // Once that day, every week on its weekday, or every day.
  readonly repeats: readonly RepeatChoice[];
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
  readonly day: number;
  readonly dayName: string;
  readonly time: string;
  readonly kind: EventKindId;
  readonly label: string;
  readonly siteKey: string;
  readonly site: string;
}

export interface ProgrammeView {
  readonly sites: readonly SiteTab[];
  readonly types: readonly SiteType[];
  // Null with no stage on the plot.
  readonly site: SiteTab | null;
  readonly days: readonly DayColumn[];
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

const movable = (programme: Programme, id: number, start: number): boolean =>
  rebook(programme, id, { start }).refusal === null;

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
      earlier: movable(programme, booking.id, booking.start - START_STEP),
      later: movable(programme, booking.id, booking.start + START_STEP),
      canSwitch:
        booking.builtIn !== undefined &&
        switchBuiltIn(programme, booking.id, booking.off === true) !== programme,
    }));
}

function minutesIn(kind: EventKind, part: DayPart): readonly number[] {
  const { from, to } = PART_HOURS[part];
  const minutes: number[] = [];
  for (
    let minute = Math.max(kind.earliest, from);
    minute <= kind.latest && minute < to;
    minute += START_STEP
  ) {
    minutes.push(minute);
  }
  return minutes;
}

const repeatsFrom = (day: number): readonly Repeat[] => [
  { every: 'once', day },
  { every: 'week', weekday: weekdayOf(day) },
  { every: 'day' },
];

interface Slot {
  readonly facts: ProgrammeFacts;
  readonly site: EventSite;
  readonly day: number;
}

function startsIn(slot: Slot, kind: EventKind, part: DayPart): readonly StartChoice[] {
  const { facts, site, day } = slot;
  return minutesIn(kind, part)
    .map((minute) => ({
      minute,
      words: clockWords(minute),
      repeats: repeatsFrom(day).map((repeat) => ({
        words: repeatWords(repeat),
        repeat,
        refusal: bookingRefusal(
          facts.programme,
          { kind: kind.id, site, repeat, start: minute },
          facts.now,
        ),
      })),
    }))
    .filter((start) => start.repeats.some((choice) => choice.refusal === null));
}

// Stops at the first booking that would be taken: it runs for every cell of the week.
const openAt = (slot: Slot, kinds: readonly EventKind[], part: DayPart): boolean =>
  kinds.some((kind) =>
    minutesIn(kind, part).some((start) =>
      repeatsFrom(slot.day).some(
        (repeat) =>
          bookingRefusal(
            slot.facts.programme,
            { kind: kind.id, site: slot.site, repeat, start },
            slot.facts.now,
          ) === null,
      ),
    ),
  );

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

const bookableOn = (site: EventSite): readonly EventKind[] =>
  KINDS.filter((kind) => kind.builtIn !== true && kind.sites.includes(site.kind));

// A kind whose hours miss the part entirely has no card; one merely booked up has no starts, and
// goes to the end so what can still be booked comes first.
export function cardsAt(
  facts: ProgrammeFacts,
  site: SiteTab,
  day: number,
  part: DayPart,
): readonly Card[] {
  const slot = { facts, site: site.site, day };
  return bookableOn(site.site)
    .filter((kind) => minutesIn(kind, part).length > 0)
    .map((kind) => cardOf(kind, startsIn(slot, kind, part), facts, site.capacity))
    .toSorted((a, b) => Number(a.starts.length === 0) - Number(b.starts.length === 0));
}

function upcomingOf(facts: ProgrammeFacts, tabs: readonly SiteTab[]): readonly Upcoming[] {
  const labels = new Map(tabs.map((tab) => [tab.key, tab.label]));
  return nextEvents(facts.programme, facts.now, UPCOMING).map((each: Occurrence) => ({
    key: `${each.booking}:${each.day}`,
    day: each.day,
    dayName: dayWords(each.day),
    time: clockWords(minuteOf(each.start)),
    kind: each.kind,
    label: labelOf(EVENT_KINDS[each.kind], each.tier),
    siteKey: siteKey(each.site),
    site: labels.get(siteKey(each.site)) ?? 'nowhere',
  }));
}

export interface UpcomingFilter {
  readonly kind: EventKindId | null;
  readonly site: string | null;
}

export const filterUpcoming = (
  upcoming: readonly Upcoming[],
  filter: UpcomingFilter,
): readonly Upcoming[] =>
  upcoming.filter(
    (each) =>
      (filter.kind === null || each.kind === filter.kind) &&
      (filter.site === null || each.siteKey === filter.site),
  );

export interface FilterChoice<T extends string> {
  readonly id: T;
  readonly label: string;
}

// Only what is on, so no choice in the filter ever leaves the list empty.
export function upcomingKinds(upcoming: readonly Upcoming[]): readonly FilterChoice<EventKindId>[] {
  const kinds = new Set(upcoming.map((each) => each.kind));
  return KINDS.filter((kind) => kinds.has(kind.id)).map((kind) => ({
    id: kind.id,
    label: kind.label,
  }));
}

export function upcomingSites(upcoming: readonly Upcoming[]): readonly FilterChoice<string>[] {
  const sites = new Map(upcoming.map((each) => [each.siteKey, each.site]));
  return [...sites].map(([id, label]) => ({ id, label }));
}

export interface UpcomingDay {
  readonly day: number;
  readonly name: string;
  readonly events: readonly Upcoming[];
}

// The list comes in time order, so a day's events are always next to each other.
export function upcomingByDay(upcoming: readonly Upcoming[]): readonly UpcomingDay[] {
  const days: UpcomingDay[] = [];
  for (const each of upcoming) {
    const last = days.at(-1);
    if (last?.day === each.day) days[days.length - 1] = { ...last, events: [...last.events, each] };
    else days.push({ day: each.day, name: each.dayName, events: [each] });
  }
  return days;
}

const BEACH_LABEL = 'Beach';

const BEACH_TYPE = 'beach';

// The beach after the stages, as sitesOf lists it, holding as many as the sand does.
function tabsOf(stages: readonly Venue[], beachRoom: number): readonly SiteTab[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  return sitesOf(stages, KINDS, beachRoom > 0).flatMap((site): SiteTab[] => {
    const key = siteKey(site);
    if (site.kind === 'beach') {
      return [{ key, site, label: BEACH_LABEL, capacity: beachRoom, type: BEACH_TYPE }];
    }
    const stage = byKey.get(key);
    if (!stage) return [];
    return [{ key, site, label: stage.label, capacity: stage.capacity, type: familyOf(stage.id) }];
  });
}

// In the order of their first stage, so the kinds read as the stages do: by name, beach last.
function typesOf(tabs: readonly SiteTab[], stages: readonly Venue[]): readonly SiteType[] {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  const types = new Map<string, SiteType>();
  for (const tab of tabs) {
    const known = types.get(tab.type);
    if (known) {
      types.set(tab.type, { ...known, sites: [...known.sites, tab] });
      continue;
    }
    const stage = byKey.get(tab.key);
    types.set(tab.type, {
      key: tab.type,
      label: stage ? (stage.kind ?? stage.label) : BEACH_LABEL,
      sign: stage ? signOf(stage.id) : null,
      sites: [tab],
    });
  }
  return [...types.values()];
}

const chosenTab = (tabs: readonly SiteTab[], chosen: string | null): SiteTab | null =>
  tabs.find((tab) => tab.key === chosen) ?? tabs[0] ?? null;

const UNKNOWN_WEATHER = { weather: null, pinned: false } as const;

const CLOSED = { morning: false, afternoon: false, evening: false } as const;

function openParts(slot: Slot | null): DayColumn['open'] {
  if (!slot) return CLOSED;
  const kinds = bookableOn(slot.site);
  return {
    morning: openAt(slot, kinds, 'morning'),
    afternoon: openAt(slot, kinds, 'afternoon'),
    evening: openAt(slot, kinds, 'evening'),
  };
}

function dayColumn(
  facts: ProgrammeFacts,
  site: SiteTab | null,
  day: number,
  forecast: ReadonlyMap<number, DayForecast>,
): DayColumn {
  // No booking sits on the empty key, so a plot with no stage shows an empty week.
  const chips = chipsOn(facts.programme, site ? site.key : '', day);
  const { weather, pinned } = forecast.get(day) ?? UNKNOWN_WEATHER;
  return {
    day,
    name: dayWords(day),
    weather,
    pinned,
    parts: {
      morning: chips.filter((chip) => partOf(chip.minute) === 'morning'),
      afternoon: chips.filter((chip) => partOf(chip.minute) === 'afternoon'),
      evening: chips.filter((chip) => partOf(chip.minute) === 'evening'),
    },
    open: openParts(site ? { facts, site: site.site, day } : null),
  };
}

// `chosen` is a site key; one no longer standing falls back to the first stage.
export function programmeView(facts: ProgrammeFacts, chosen: string | null): ProgrammeView {
  const sites = tabsOf(facts.stages, facts.beachRoom);
  const site = chosenTab(sites, chosen);
  const today = dayAt(facts.now);
  const forecast = new Map(facts.forecast.map((each) => [each.day, each]));
  return {
    sites,
    types: typesOf(sites, facts.stages),
    site,
    days: Array.from({ length: DAYS_SHOWN }, (_, offset) =>
      dayColumn(facts, site, today + offset, forecast),
    ),
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
