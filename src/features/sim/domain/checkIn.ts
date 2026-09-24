import { checkInParty, checkOutParty, freeBodiesOf, type Guests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import { ARRIVAL_MOOD, type Happiness } from './happiness';
import { resetNeeds, type Needs } from './needs';
import { arrivalsFor, type Rating } from './rating';
import { TICKS_PER_DAY } from './simClock';

export const CHECK_IN_TICK = 11 * 60;

// The first wave is the day's check-in, and the largest: a morning line at reception has the
// afternoon to clear, so a single desk is not flooded at once.
export const ARRIVAL_WAVES: readonly { readonly tick: number; readonly share: number }[] = [
  { tick: CHECK_IN_TICK, share: 0.5 },
  { tick: 14 * 60, share: 0.3 },
  { tick: 17 * 60, share: 0.2 },
];

// Float sums like 0.5 + 0.3 land a hair past the share, which ceil would round up a whole guest.
const SHARE_EPSILON = 1e-9;

const timesBy = (at: number, tick: number): number => Math.floor((tick - at) / TICKS_PER_DAY) + 1;

const dueIn = (at: number, from: number, to: number): boolean =>
  to >= from && timesBy(at, to) > timesBy(at, from - 1);

// Asked with up to MAX_TICKS_PER_ADVANCE ticks at once, so an `=== CHECK_IN_TICK` test would step over it.
export function checkInDue(from: number, to: number): boolean {
  return dueIn(CHECK_IN_TICK, from, to);
}

export function wavesDue(from: number, to: number): readonly number[] {
  const due: number[] = [];
  for (const [wave, { tick }] of ARRIVAL_WAVES.entries()) {
    if (dueIn(tick, from, to)) due.push(wave);
  }
  return due;
}

export function arrivalsDueBy(planned: number, wave: number): number {
  let share = 0;
  for (let each = 0; each <= wave && each < ARRIVAL_WAVES.length; each++) {
    share += ARRIVAL_WAVES[each]!.share;
  }
  return Math.min(planned, Math.max(0, Math.ceil(planned * share - SHARE_EPSILON)));
}

export function freeBedsOn(guests: Guests): number {
  let free = 0;
  for (let home = 0; home < guests.freeBeds.length; home++) free += guests.freeBeds[home]!;
  return free;
}

// A party no lodging can house is turned away rather than housed nowhere: a guest with no bed
// walks all night and drags down tomorrow's rating. Needs and mood are drawn afresh because the
// body was somebody else's.
export function runCheckIn(parts: {
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  readonly rating: Rating;
  readonly day: number;
  readonly random: () => number;
  // A wave's share of the day's arrivals; omitted, the whole day arrives at once.
  readonly room?: number;
}): readonly number[] {
  const { guests, needs, happiness, rating, day, random } = parts;
  const free = freeBodiesOf(guests);
  let room = parts.room ?? arrivalsFor(rating, freeBedsOn(guests));
  const arrived: number[] = [];

  while (room > 0) {
    const party = checkInParty(guests, { random, day, free });
    if (!party) break;
    if (guests.home[party.members[0]!] === NO_HOME) {
      // No coach after them: whatever is left free would not fit them either.
      checkOutParty(guests, guests.parties.length - 1);
      break;
    }
    for (const person of party.members) {
      resetNeeds(needs, person, random);
      happiness.level[person] = ARRIVAL_MOOD;
      arrived.push(person);
    }
    room -= party.members.length;
  }
  return arrived;
}
