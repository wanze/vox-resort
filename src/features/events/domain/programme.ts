import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { EVENT_KINDS, type EventKindId } from './catalogue';
import { dayAt, START_STEP, tickAt, weekdayOf, type Weekday } from './week';

export type EventSite =
  | { readonly kind: 'stage'; readonly venue: string }
  | { readonly kind: 'beach' };

export type Repeat =
  | { readonly every: 'day' }
  | { readonly every: 'week'; readonly weekday: Weekday }
  | { readonly every: 'once'; readonly day: number };

export interface Booking {
  readonly id: number;
  readonly kind: EventKindId;
  readonly site: EventSite;
  readonly repeat: Repeat;
  // A minute of the day.
  readonly start: number;
  readonly tier?: string;
  // A BUILT_INS id: such a booking is moved or switched off, never removed.
  readonly builtIn?: string;
  readonly off?: boolean;
}

export interface Programme {
  readonly bookings: readonly Booking[];
  readonly nextId: number;
}

export interface Occurrence {
  readonly booking: number;
  readonly kind: EventKindId;
  readonly site: EventSite;
  readonly day: number;
  // Absolute ticks.
  readonly start: number;
  readonly end: number;
  readonly tier?: string;
}

export interface BuiltIn {
  readonly id: string;
  readonly kind: EventKindId;
  readonly repeat: Repeat;
  readonly start: number;
}

export type BookingDraft = Omit<Booking, 'id'>;

export interface BookingChange {
  readonly start?: number;
  readonly site?: EventSite;
  readonly repeat?: Repeat;
}

export type BookingRefusal = 'overlap' | 'hours' | 'site' | 'past' | 'built-in';

export interface BookingResult {
  readonly programme: Programme;
  readonly refusal: BookingRefusal | null;
}

export const BUILT_INS: readonly BuiltIn[] = [
  { id: 'welcome', kind: 'welcome', repeat: { every: 'day' }, start: 10 * 60 },
];

export const EMPTY_PROGRAMME: Programme = { bookings: [], nextId: 1 };

export const ANNOUNCE_LEAD = 60;

// Room to clear the stage and set up the next act.
export const CHANGEOVER = 30;

const WEEK = 7;

// A placement key always holds a '#', so a stage never reads as the beach.
export function siteKey(site: EventSite): string {
  return site.kind === 'stage' ? site.venue : 'beach';
}

export function occursOn(repeat: Repeat, day: number): boolean {
  if (repeat.every === 'day') return true;
  if (repeat.every === 'week') return weekdayOf(day) === repeat.weekday;
  return repeat.day === day;
}

function shareADay(a: Repeat, b: Repeat): boolean {
  if (a.every === 'day' || b.every === 'day') return true;
  if (a.every === 'once') return occursOn(b, a.day);
  if (b.every === 'once') return occursOn(a, b.day);
  return a.weekday === b.weekday;
}

const endOf = (booking: Pick<Booking, 'kind' | 'start'>): number =>
  booking.start + EVENT_KINDS[booking.kind].duration;

function overlaps(a: BookingDraft, b: BookingDraft): boolean {
  if (siteKey(a.site) !== siteKey(b.site) || !shareADay(a.repeat, b.repeat)) return false;
  return a.start < endOf(b) + CHANGEOVER && b.start < endOf(a) + CHANGEOVER;
}

function refusalOf(draft: BookingDraft, others: readonly Booking[]): BookingRefusal | null {
  const kind = EVENT_KINDS[draft.kind];
  if (draft.start < kind.earliest || draft.start > kind.latest || draft.start % START_STEP !== 0) {
    return 'hours';
  }
  if (!kind.sites.includes(draft.site.kind)) return 'site';
  if (draft.off !== true && others.some((other) => other.off !== true && overlaps(draft, other))) {
    return 'overlap';
  }
  return null;
}

export function book(programme: Programme, draft: BookingDraft, now: number): BookingResult {
  if (draft.builtIn !== undefined || EVENT_KINDS[draft.kind].builtIn === true) {
    return { programme, refusal: 'built-in' };
  }
  const refusal =
    refusalOf(draft, programme.bookings) ??
    (draft.repeat.every === 'once' && tickAt(draft.repeat.day, draft.start) - ANNOUNCE_LEAD < now
      ? 'past'
      : null);
  if (refusal) return { programme, refusal };
  const booking: Booking = { ...draft, id: programme.nextId };
  return {
    programme: { bookings: [...programme.bookings, booking], nextId: programme.nextId + 1 },
    refusal: null,
  };
}

export function unbook(programme: Programme, id: number): Programme {
  const booking = programme.bookings.find((each) => each.id === id);
  if (!booking || booking.builtIn !== undefined) return programme;
  return { ...programme, bookings: programme.bookings.filter((each) => each.id !== id) };
}

export function rebook(programme: Programme, id: number, change: BookingChange): BookingResult {
  const booking = programme.bookings.find((each) => each.id === id);
  if (!booking) return { programme, refusal: null };
  const moved: Booking = { ...booking, ...change };
  const refusal = refusalOf(
    moved,
    programme.bookings.filter((each) => each.id !== id),
  );
  if (refusal) return { programme, refusal };
  return { programme: replaced(programme, moved), refusal: null };
}

// Switching back on is refused while something else holds its slot, so a stage never runs two.
export function switchBuiltIn(programme: Programme, id: number, on: boolean): Programme {
  const booking = programme.bookings.find((each) => each.id === id);
  if (!booking || booking.builtIn === undefined || (booking.off !== true) === on) return programme;
  const others = programme.bookings.filter((each) => each.id !== id);
  if (on && refusalOf({ ...booking, off: false }, others) !== null) return programme;
  const { off: _off, ...rest } = booking;
  return replaced(programme, on ? rest : { ...booking, off: true });
}

function replaced(programme: Programme, booking: Booking): Programme {
  return {
    ...programme,
    bookings: programme.bookings.map((each) => (each.id === booking.id ? booking : each)),
  };
}

// A built-in kept from before its kind's hours moved goes back to the kind's start.
function inItsHours(booking: Booking): Booking {
  const kind = EVENT_KINDS[booking.kind];
  if (booking.builtIn === undefined) return booking;
  if (booking.start >= kind.earliest && booking.start <= kind.latest) return booking;
  return { ...booking, start: kind.start };
}

// With no stage left, a built-in stays where it was and simply cannot run.
export function withBuiltIns(
  programme: Programme,
  builtIns: readonly BuiltIn[],
  stages: readonly string[],
  rank: (key: string) => number = () => 0,
): Programme {
  let changed = false;
  let bookings = programme.bookings.map((each) => {
    const kept = inItsHours(each);
    changed ||= kept !== each;
    return kept;
  });
  const first = stages.toSorted((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
  if (first === undefined) return changed ? { ...programme, bookings } : programme;
  const standing = new Set(stages);
  const site: EventSite = { kind: 'stage', venue: first };
  let { nextId } = programme;
  bookings = bookings.map((each) => {
    if (each.builtIn === undefined || each.site.kind !== 'stage' || standing.has(each.site.venue)) {
      return each;
    }
    changed = true;
    return { ...each, site };
  });
  for (const builtIn of builtIns) {
    if (bookings.some((each) => each.builtIn === builtIn.id)) continue;
    const { id: _id, ...rest } = builtIn;
    bookings.push({ ...rest, id: nextId, site, builtIn: builtIn.id });
    nextId++;
    changed = true;
  }
  return changed ? { bookings, nextId } : programme;
}

export function keepStanding(programme: Programme, sites: ReadonlySet<string>): Programme {
  const bookings = programme.bookings.filter(
    (each) => each.builtIn !== undefined || sites.has(siteKey(each.site)),
  );
  return bookings.length === programme.bookings.length ? programme : { ...programme, bookings };
}

// A one-off that has had its day is kept out of the save; a running one has its own copy.
export function dropPast(programme: Programme, day: number): Programme {
  const bookings = programme.bookings.filter(
    (each) => each.repeat.every !== 'once' || each.repeat.day >= day,
  );
  return bookings.length === programme.bookings.length ? programme : { ...programme, bookings };
}

function occurrenceOf(booking: Booking, day: number): Occurrence {
  const start = tickAt(day, booking.start);
  return {
    booking: booking.id,
    kind: booking.kind,
    site: booking.site,
    day,
    start,
    end: start + EVENT_KINDS[booking.kind].duration,
    ...(booking.tier === undefined ? {} : { tier: booking.tier }),
  };
}

export function occurrencesOn(programme: Programme, day: number): readonly Occurrence[] {
  return programme.bookings
    .filter((each) => each.off !== true && occursOn(each.repeat, day))
    .map((each) => occurrenceOf(each, day))
    .toSorted((a, b) => a.start - b.start || a.booking - b.booking);
}

// Inclusive at both ends, as the frames hand their ticks over: [from, to] then [to + 1, ...].
export function eventsDue(
  programme: Programme,
  from: number,
  to: number,
  lead: number,
): readonly Occurrence[] {
  const due: Occurrence[] = [];
  if (to < from) return due;
  const last = Math.floor((to + lead) / TICKS_PER_DAY);
  for (let day = Math.floor((from + lead) / TICKS_PER_DAY); day <= last; day++) {
    for (const occurrence of occurrencesOn(programme, day)) {
      const at = occurrence.start - lead;
      if (at >= from && at <= to) due.push(occurrence);
    }
  }
  return due;
}

export function eventOn(programme: Programme, site: EventSite, tick: number): Occurrence | null {
  const key = siteKey(site);
  return (
    occurrencesOn(programme, dayAt(tick)).find(
      (each) => siteKey(each.site) === key && each.start <= tick && tick < each.end,
    ) ?? null
  );
}

export function nextEvents(
  programme: Programme,
  from: number,
  count: number,
): readonly Occurrence[] {
  const next: Occurrence[] = [];
  const first = dayAt(from);
  for (let day = first; day <= first + WEEK && next.length < count; day++) {
    for (const occurrence of occurrencesOn(programme, day)) {
      if (occurrence.start >= from && next.length < count) next.push(occurrence);
    }
  }
  return next;
}

export function postponed(programme: Programme, occurrence: Occurrence): Programme {
  const booking = programme.bookings.find((each) => each.id === occurrence.booking);
  if (!booking) return programme;
  const tomorrow: Repeat = { every: 'once', day: occurrence.day + 1 };
  if (booking.repeat.every === 'once') {
    const moved = rebook(programme, booking.id, { repeat: tomorrow });
    return moved.refusal ? unbook(programme, booking.id) : moved.programme;
  }
  const { id: _id, builtIn: _builtIn, off: _off, ...rest } = booking;
  const draft: BookingDraft = { ...rest, repeat: tomorrow };
  if (refusalOf(draft, programme.bookings) !== null) return programme;
  return {
    bookings: [...programme.bookings, { ...draft, id: programme.nextId }],
    nextId: programme.nextId + 1,
  };
}
