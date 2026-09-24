import { checkInParty, checkOutParty, freeBodiesOf, type Guests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';
import { ARRIVAL_MOOD, type Happiness } from './happiness';
import { resetNeeds, type Needs } from './needs';
import { arrivalsFor, type Rating } from './rating';
import { TICKS_PER_DAY } from './simClock';

export const CHECK_IN_TICK = 11 * 60;

const coachesBy = (tick: number): number => Math.floor((tick - CHECK_IN_TICK) / TICKS_PER_DAY) + 1;

// Asked with up to MAX_TICKS_PER_ADVANCE ticks at once, so an `=== CHECK_IN_TICK` test would step over it.
export function checkInDue(from: number, to: number): boolean {
  if (to < from) return false;
  return coachesBy(to) > coachesBy(from - 1);
}

function freeBedsOn(guests: Guests): number {
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
}): readonly number[] {
  const { guests, needs, happiness, rating, day, random } = parts;
  const free = freeBodiesOf(guests);
  let room = arrivalsFor(rating, freeBedsOn(guests));
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
