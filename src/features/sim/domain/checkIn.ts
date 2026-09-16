/**
 * Who arrives in the morning.
 *
 * The other end of `router.ts`'s walk to the gate. Once a day the coaches come
 * in, and how full they are is the rating: build well and the plot fills, build
 * badly and you can watch it empty.
 *
 * ## A body, then a person
 *
 * Nobody is *created* here. A person index is a body the crowd's meshes were
 * built around and may never be redrawn - see "A slot's body never changes" in
 * `plans/020-arrivals-and-departures.md` - so an arriving party is dealt into
 * free bodies of the right shape, and a family wanting three children with one
 * child body free arrives as a family of three. `guests.ts` owns that dealing;
 * this module owns how many of them there are and what state they arrive in.
 *
 * ## Here rather than in `showcase.ts`
 *
 * A morning's arrivals are a decision over the registry, the needs, the mood and
 * the rating, and every one of those is a pure structure. Put in the animation
 * loop it could only be tested with a renderer standing behind it.
 */

import { checkInParty, checkOutParty, freeBodiesOf, type Guests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import { ARRIVAL_MOOD, type Happiness } from './happiness';
import { resetNeeds, type Needs } from './needs';
import { arrivalsFor, type Rating } from './rating';
import { TICKS_PER_DAY } from './simClock';

/** The tick of the day the coaches come in: eleven in the morning. */
export const CHECK_IN_TICK = 11 * 60;

/** How many of the check-in hour have gone by at or before this tick. */
const coachesBy = (tick: number): number => Math.floor((tick - CHECK_IN_TICK) / TICKS_PER_DAY) + 1;

/**
 * Whether a whole day's arrivals fall in this run of ticks.
 *
 * Asked with the ticks the clock just produced, which is up to
 * `MAX_TICKS_PER_ADVANCE` of them, so the window cannot be stepped over the way
 * a `=== CHECK_IN_TICK` test would be. `night.ts`'s `wakeWhoeverIsUp` guards the
 * same hazard from the other side.
 *
 * `from` and `to` are whole simulated minutes since the resort opened, both
 * inclusive; a run of no ticks is never due.
 */
export function checkInDue(from: number, to: number): boolean {
  if (to < from) return false;
  return coachesBy(to) > coachesBy(from - 1);
}

/** Beds standing free across every lodging on the plot. */
function freeBedsOn(guests: Guests): number {
  let free = 0;
  for (let home = 0; home < guests.freeBeds.length; home++) free += guests.freeBeds[home]!;
  return free;
}

/**
 * Checks in as many parties as the rating and the free beds allow, and hands
 * back who arrived.
 *
 * Parties are dealt until the day's allowance runs out, until there are no
 * bodies of the right shape left, or until one arrives that no single lodging
 * has room for - **that one is turned away at the gate rather than housed
 * nowhere**, because a guest with no bed walks all night, is miserable about it,
 * and drags down the rating that decides who comes tomorrow.
 *
 * Every arrival's needs and mood are drawn afresh: the body they were dealt was
 * somebody else's a week ago, and a guest who checked in exhausted because the
 * last occupant was would be a stranger inheriting a bad holiday.
 */
export function runCheckIn(parts: {
  readonly guests: Guests;
  readonly needs: Needs;
  readonly happiness: Happiness;
  readonly rating: Rating;
  readonly day: number;
  readonly random: () => number;
}): readonly number[] {
  const { guests, needs, happiness, rating, day, random } = parts;
  const free = freeBodiesOf(guests);
  let room = arrivalsFor(rating, freeBedsOn(guests));
  const arrived: number[] = [];

  while (room > 0) {
    const party = checkInParty(guests, { random, day, free });
    if (!party) break;
    if (guests.home[party.members[0]!] === NO_HOME) {
      // Nowhere on the plot sleeps a party this size. They go straight back out
      // of the gate they came in by, their bodies with them, and the coach after
      // them does not run: whatever is left free would not fit them either.
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
