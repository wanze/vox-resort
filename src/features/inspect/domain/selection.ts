/**
 * What is selected, as something to show.
 *
 * A flat, already-worded value rather than a pointer into the crowd, and that
 * shape is the point: it is computed once when something is clicked and handed
 * to React as state, so the panel re-renders when the selection changes and
 * never when the resort ticks. The one thing that does change every frame - what
 * the guest is doing this instant - is not in here at all; it goes to a DOM node
 * through a ref, the way the frame rate does. See `hudOverlay.ts`.
 *
 * What a guest *wants* is now a real answer, read off `sim/domain/` - the need
 * pulling hardest and where they would go to see to it. Who is *inside* a place
 * still is not: nothing counts anybody through a door yet, and a made-up
 * occupancy is worse than none. That is plan 018.
 */

import {
  TILE_VOXELS,
  type GuestNeed,
  type ModelVenue,
  type VenueRole,
} from '../../../../voxel-gen/voxelgen.ts';
import { venueOf } from '../../catalog/domain/objectTypes';
import { isRoaming, RESTING, restingOn, type Crowd } from '../../crowd/domain/crowd';
import { fullNameOf, homeOf, partyOf, type Guests } from '../../guests/domain/guests';
import type { PartyKind } from '../../guests/domain/parties';
import type { Placement } from '../../layout/domain/resortLayout';
import { chooseVenue } from '../../sim/domain/chooseVenue';
import { NEEDS, strongestNeed, type Needs } from '../../sim/domain/needs';
import type { Venue } from '../../sim/domain/venues';

/** What was clicked on, as the simulation names it: a person index or a placement key. */
export type InspectTarget = { readonly person: number } | { readonly key: string } | null;

/** The person selected, or null when the selection is a place or nothing. */
export function personOf(target: InspectTarget): number | null {
  return target !== null && 'person' in target ? target.person : null;
}

/** Whether the selection is the placement under this key. */
export function namesPlacement(target: InspectTarget, key: string): boolean {
  return target !== null && 'key' in target && target.key === key;
}

export interface PartyMemberView {
  readonly person: number;
  readonly name: string;
  readonly child: boolean;
}

export interface GuestView {
  readonly kind: 'guest';
  readonly person: number;
  readonly name: string;
  readonly child: boolean;
  /** What kind of party they came in, and who is in it, themselves included. */
  readonly partyKind: PartyKind;
  readonly family: string;
  readonly members: readonly PartyMemberView[];
  /** Where they sleep, or null when the resort had no bed for them. */
  readonly home: { readonly key: string; readonly label: string } | null;
  /** Day they arrived, relative to opening; negative for the ones already here. */
  readonly arrivedOn: number;
  readonly nights: number;
  /** Nights left, given the day it is now; negative once they are overdue to go. */
  readonly nightsLeft: number;
  /** How well each need is met, 0..1, in `NEEDS` order. Worded by the panel. */
  readonly needs: readonly { readonly need: GuestNeed; readonly level: number }[];
  /** Where they would go next, or null while they are content. */
  readonly wants: { readonly need: GuestNeed; readonly label: string } | null;
}

export interface PlaceView {
  readonly kind: 'place';
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly tile: { readonly x: number; readonly z: number };
  /** What a guest can do here, already worded; null where the object is dressing. */
  readonly venue: {
    readonly role: VenueRole;
    readonly capacity: number;
    readonly serves: readonly string[];
    readonly dwell: string;
    readonly beds: number;
  } | null;
  /** Guests who sleep here. Empty for anything that is not a lodging. */
  readonly residents: readonly PartyMemberView[];
}

export type SelectionView = GuestView | PlaceView;

const NEED_LABELS: { readonly [need in GuestNeed]: string } = {
  hunger: 'Hunger',
  thirst: 'Thirst',
  energy: 'Energy',
  fun: 'Fun',
  hygiene: 'Hygiene',
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * A visit's length in the unit it is thought of in: a lunch is minutes and a
 * night is hours, and "420 to 540 min" is a number nobody reads.
 */
function dwellWording({ min, max }: ModelVenue['dwellSeconds']): string {
  const [unit, suffix] = min >= HOUR ? [HOUR, 'h'] : [MINUTE, 'min'];
  const from = Math.round(min / unit);
  const to = Math.round(max / unit);
  return from === to ? `${from} ${suffix}` : `${from} to ${to} ${suffix}`;
}

function memberOf(guests: Guests, person: number): PartyMemberView {
  return { person, name: fullNameOf(guests, person), child: guests.child[person] === 1 };
}

/** Where a guest is standing, which `selection.ts` is never the one to know. */
export interface GuestSpot {
  readonly x: number;
  readonly z: number;
}

/**
 * Where this guest would go next, already worded, or null while they want
 * nothing or nowhere on the plot serves what they want.
 */
function wantsOf(options: {
  guests: Guests;
  needs: Needs;
  venues: readonly Venue[];
  person: number;
  at: GuestSpot;
}): GuestView['wants'] {
  const { guests, needs, venues, person, at } = options;
  const choice = chooseVenue({ needs, guests, person, venues, x: at.x, z: at.z });
  return choice === null ? null : { need: choice.need, label: venues[choice.venue]!.label };
}

/**
 * Everything worth showing about one guest, worded once.
 *
 * Takes where they are as {@link GuestSpot} rather than reaching for the crowd:
 * this module takes a `Crowd` only in {@link activityLine}, and a view that had
 * to be built from one could not be built for somebody who is not walking.
 */
export function guestView(
  guests: Guests,
  needs: Needs,
  venues: readonly Venue[],
  person: number,
  day: number,
  at: GuestSpot,
): GuestView {
  const party = guests.parties[guests.party[person]!]!;
  const home = homeOf(guests, person);
  const arrivedOn = guests.arrivedOn[person]!;
  const nights = guests.nights[person]!;
  return {
    kind: 'guest',
    ...memberOf(guests, person),
    partyKind: party.kind,
    family: party.family,
    members: partyOf(guests, person).map((member) => memberOf(guests, member)),
    home: home ? { key: home.key, label: home.label } : null,
    arrivedOn,
    nights,
    nightsLeft: arrivedOn + nights - day,
    needs: NEEDS.map((need) => ({ need, level: needs.level[need][person]! })),
    wants: wantsOf({ guests, needs, venues, person, at }),
  };
}

export function placeView(placement: Placement, label: string, guests: Guests): PlaceView {
  const venue = venueOf(placement.id);
  const home = guests.homes.findIndex((candidate) => candidate.key === placement.key);
  const residents: PartyMemberView[] = [];
  if (home !== -1) {
    for (let i = 0; i < guests.count; i++) {
      if (guests.home[i] === home) residents.push(memberOf(guests, i));
    }
  }
  return {
    kind: 'place',
    key: placement.key,
    id: placement.id,
    label,
    tile: { x: placement.tileX, z: placement.tileZ },
    venue: venue
      ? {
          role: venue.role,
          capacity: venue.capacity,
          serves: (venue.satisfies ?? []).map((relief) => NEED_LABELS[relief.need]),
          dwell: dwellWording(venue.dwellSeconds),
          beds: venue.beds ?? 0,
        }
      : null,
    residents,
  };
}

/** The one word a need is felt as, for the live line. */
const NEED_MOODS: { readonly [need in GuestNeed]: string } = {
  hunger: 'Hungry',
  thirst: 'Thirsty',
  energy: 'Tired',
  fun: 'Bored',
  hygiene: 'Grubby',
};

/**
 * What a guest is doing this instant, in a few words: the one line of the panel
 * that is rewritten per frame.
 *
 * The mood in front of it is the guest thought - one word for the need pulling
 * hardest, in a line that was being written anyway - and it doubles as the
 * debug view for the decision layer: watch it change as a guest runs down, and
 * you are watching `chooseVenue` decide. A content guest gets no word at all
 * rather than a cheerful one.
 *
 * `heading` is the venue they are actually walking to, or null when they have
 * nowhere to be. The venue rather than a router, for the reason this module
 * takes a spot rather than a crowd: what decides where anybody is going is not
 * something the wording of a line should be able to reach.
 *
 * The one thing in this module that allocates per frame - a short string for
 * the one guest selected - and deliberately so: the overlay skips the DOM write
 * when it is unchanged, and a string per frame is not what a frame is short of.
 */
export function activityLine(
  crowd: Crowd,
  needs: Needs,
  guests: Guests,
  person: number,
  heading: Venue | null,
): string {
  // A plot with its paving taken up walks nobody, though everybody still exists.
  if (person >= crowd.count) return 'Nowhere to walk';
  const wanted = strongestNeed(needs, guests, person);
  const mood = wanted === null ? '' : `${NEED_MOODS[wanted.need]} · `;
  const resting = restingOn(crowd, person);
  const doing =
    resting === RESTING.sitting
      ? 'Sitting'
      : resting === RESTING.lying
        ? 'Lying down'
        : isRoaming(crowd, person)
          ? 'On the beach'
          : // Where they are going, when somebody is routing them: "Walking" on
            // its own is what a guest with nowhere to be is doing, and it is the
            // line plan 016 wrote.
            heading === null
            ? 'Walking'
            : `Walking to the ${heading.label}`;
  const tileX = Math.floor(crowd.x[person]! / TILE_VOXELS);
  const tileZ = Math.floor(crowd.z[person]! / TILE_VOXELS);
  return `${mood}${doing} · tile ${tileX}, ${tileZ}`;
}
