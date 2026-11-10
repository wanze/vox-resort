import type { Guests } from '../../guests/domain/guests';
import { homeWithRoom, NO_HOME, type Home } from '../../guests/domain/homes';
import { partyShapeFor, type PartyMix, type PartyShape } from '../../guests/domain/parties';
import { createRandom } from '../../layout/domain/random';
import type { Booking } from './bookings';
import { partyKindsOf, type Offer } from './offers';

// A stream of its own, off the booking alone, so the beds held are the beds the group brings.
const SHAPE_SALT = 0x5bd1_e995;
const GOLDEN = 0x9e37_79b1;

const NO_ONE: PartyMix = { family: 0, couple: 0, friends: 0, solo: 0 };

export function groupShapesOf(
  offer: Pick<Offer, 'id' | 'kind' | 'parties'>,
): readonly PartyShape[] {
  const random = createRandom(SHAPE_SALT ^ Math.imul(offer.id + 1, GOLDEN));
  return partyKindsOf(offer).map((kind) => partyShapeFor(random, { ...NO_ONE, [kind]: 1 }));
}

const sizeOf = (shape: PartyShape): number => shape.adults + shape.children;

// A guest is still in bed at the check-in of the morning they leave: departures come after it.
const leavingMorning = (arrivedOn: number, nights: number): number => arrivedOn + nights + 1;

export function groupLeavesOn(
  booking: Pick<Booking, 'arrivesOn' | 'nights'>,
  lastNight: number | undefined,
): number {
  const nights =
    lastNight === undefined
      ? booking.nights
      : Math.min(booking.nights, lastNight - booking.arrivesOn + 1);
  return leavingMorning(booking.arrivesOn, Math.max(1, nights));
}

export interface BedHold {
  readonly booking: number;
  readonly arrivesOn: number;
  readonly leavesOn: number;
  // Per lodging, in the order of the guests' homes.
  readonly beds: Int32Array;
  // The sizes of the parties no lodging has room for.
  readonly unhoused: readonly number[];
}

export type HoldingGuests = Pick<
  Guests,
  'count' | 'present' | 'home' | 'arrivedOn' | 'nights' | 'homes' | 'freeBeds'
>;

export interface HoldOptions {
  readonly lastNight?: number | undefined;
  // Whether a lodging takes guests at the check-in of that day.
  readonly openOn: (key: string, day: number) => boolean;
}

// Today's room is exact, beds still unmade and lodgings shut included; a later morning's assumes
// every bed freed by then is made up, which is the housekeepers' job.
function roomOn(guests: HoldingGuests, day: number, today: number, options: HoldOptions) {
  if (day <= today) return Int32Array.from(guests.freeBeds);
  const room = Int32Array.from(guests.homes, (home) =>
    options.openOn(home.key, day) ? home.beds : 0,
  );
  for (let person = 0; person < guests.count; person++) {
    const home = guests.home[person]!;
    if (guests.present[person] !== 1 || home === NO_HOME) continue;
    if (leavingMorning(guests.arrivedOn[person]!, guests.nights[person]!) < day) continue;
    room[home] = Math.max(0, room[home]! - 1);
  }
  return room;
}

const overlaps = (hold: BedHold, arrivesOn: number, leavesOn: number): boolean =>
  hold.arrivesOn <= leavesOn && arrivesOn <= hold.leavesOn;

// The group booked first is housed first; each later one around it, so accepting an offer
// never takes a bed from a group already promised one.
export function planHolds(
  guests: HoldingGuests,
  accepted: readonly Booking[],
  today: number,
  options: HoldOptions,
): readonly BedHold[] {
  const holds: BedHold[] = [];
  const coming = accepted
    .filter((booking) => booking.state === 'booked' && booking.arrivesOn >= today)
    .toSorted((a, b) => a.id - b.id);
  for (const booking of coming) {
    const leavesOn = groupLeavesOn(booking, options.lastNight);
    const room = roomOn(guests, booking.arrivesOn, today, options);
    for (const hold of holds) {
      if (!overlaps(hold, booking.arrivesOn, leavesOn)) continue;
      for (let home = 0; home < room.length; home++) room[home] = room[home]! - hold.beds[home]!;
    }
    const beds = new Int32Array(room.length);
    const unhoused: number[] = [];
    for (const size of groupShapesOf(booking).map(sizeOf)) {
      const home = homeWithRoom(room, size);
      if (home === NO_HOME) {
        unhoused.push(size);
        continue;
      }
      room[home] = room[home]! - size;
      beds[home] = beds[home]! + size;
    }
    holds.push({ booking: booking.id, arrivesOn: booking.arrivesOn, leavesOn, beds, unhoused });
  }
  return holds;
}

const activeOn = (hold: BedHold, day: number): boolean =>
  hold.arrivesOn <= day && day <= hold.leavesOn;

// Room only ever shrinks on a group's arrival morning, so those are the only mornings to check;
// today's free beds are the caller's own check. Undefined while no group is due by then.
export function spareUntil(
  guests: HoldingGuests,
  holds: readonly BedHold[],
  today: number,
  options: HoldOptions & { readonly leavesOn: number; readonly except?: number },
): Int32Array | undefined {
  const others = holds.filter((hold) => hold.booking !== options.except);
  const mornings = new Set(
    others.filter((hold) => hold.arrivesOn <= options.leavesOn).map((hold) => hold.arrivesOn),
  );
  let spare: Int32Array | undefined;
  for (const day of mornings) {
    const room = roomOn(guests, day, today, options);
    for (const hold of others) {
      if (!activeOn(hold, day)) continue;
      for (let home = 0; home < room.length; home++) room[home] = room[home]! - hold.beds[home]!;
    }
    spare = spare ? spare.map((beds, home) => Math.min(beds, room[home]!)) : room;
  }
  return spare;
}

export interface BedsHeld {
  readonly held: number;
  readonly lodgings: readonly string[];
  readonly unhoused: number;
}

function bedsHeldOf(hold: BedHold, homes: readonly Home[]): BedsHeld {
  const lodgings = homes.filter((_, index) => hold.beds[index]! > 0).map((home) => home.label);
  return {
    held: hold.beds.reduce((sum, beds) => sum + beds, 0),
    lodgings,
    unhoused: hold.unhoused.reduce((sum, size) => sum + size, 0),
  };
}

export function bedsOfHolds(
  holds: readonly BedHold[],
  homes: readonly Home[],
): (booking: number) => BedsHeld | null {
  return (booking) => {
    const hold = holds.find((each) => each.booking === booking);
    return hold ? bedsHeldOf(hold, homes) : null;
  };
}
