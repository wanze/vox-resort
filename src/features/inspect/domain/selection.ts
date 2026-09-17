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
 * What a guest *wants* is a real answer, read off `sim/domain/` - the need
 * pulling hardest and where they would go to see to it. So is who is *inside* a
 * place and who is in the line outside it, which arrives here as a plain pair
 * of numbers: the router is what counts people through doors, and a module that
 * words a panel should not be able to reach the thing that decides where
 * anybody goes. See `sim/domain/occupancy.ts`.
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
import type { Happiness } from '../../sim/domain/happiness';
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
  /**
   * What sort of time they are having, 0..1. 1 is delighted.
   *
   * Not a sixth need, and shown apart from the five for that reason: it follows
   * them rather than being one of them. See `sim/domain/happiness.ts`.
   */
  readonly happiness: number;
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
    /** How many are inside now, and how many are in the line outside. */
    readonly inside: number;
    readonly waiting: number;
    /**
     * How clean it is, 0..1, as the staff have left it. 1 for anything the
     * caller keeps no upkeep for, which is a venue just built. See
     * `sim/domain/upkeep.ts`.
     */
    readonly cleanliness: number;
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
  happiness: Happiness,
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
    happiness: happiness.level[person] ?? 0,
  };
}

/**
 * Who is inside a venue and who is waiting at it, as the router counted them.
 *
 * A plain pair rather than the router's own type, for the reason this module
 * takes a {@link GuestSpot} rather than a crowd: what is shown about a place
 * should not be able to reach what decides where anybody goes.
 */
export interface PlaceOccupancy {
  readonly inside: number;
  readonly waiting: number;
}

export function placeView(
  placement: Placement,
  label: string,
  guests: Guests,
  occupancy: PlaceOccupancy | null,
  /**
   * How clean this place is, or null where the caller keeps no upkeep - a
   * fixture, or a venue the router has never heard of because it was built a
   * moment ago. Both are spotless, which is the truth about a new building.
   */
  cleanliness: number | null = null,
): PlaceView {
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
          // Nothing standing, nobody inside it: a venue the router has never
          // heard of is one that has just been built, and empty is the truth.
          inside: occupancy?.inside ?? 0,
          waiting: occupancy?.waiting ?? 0,
          cleanliness: cleanliness ?? 1,
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
 * The first few places in a line, as the word somebody would use.
 *
 * Only as far as a person can take in at a glance; past that the number reads
 * better than the word, and "twelfth" is a word nobody says about a queue.
 */
const PLACES: readonly string[] = ['First', 'Second', 'Third', 'Fourth'];

/** Which place in a line, worded: `"Third"`, or `"12th"` past the fourth. */
export function placeWording(slot: number): string {
  return PLACES[slot] ?? `${slot + 1}th`;
}

/**
 * What a guest is up to, as something already decided rather than a sentence.
 *
 * A small value rather than the bare string plan 017 passed, because the line
 * now has to say *what* they are doing at a place and not only which place:
 * standing in its line and being inside it read differently and are worth
 * telling apart on a glance at the panel.
 */
export type Errand =
  /** `home` for somebody walking to their own bed rather than to a venue. */
  | { readonly kind: 'walking'; readonly to: string; readonly home: boolean }
  | { readonly kind: 'waiting'; readonly at: string; readonly place: number }
  | { readonly kind: 'inside'; readonly at: string }
  | { readonly kind: 'asleep'; readonly at: string }
  /** A stay on the beach: on the way out to their spot, settled on it, or on the way back. */
  | { readonly kind: 'beach'; readonly stage: BeachStage }
  | null;

/** Where a guest is in a stay on the beach, as the router says. */
type BeachStage = 'arriving' | 'resting' | 'leaving';

/** A walk to or from a spot on the beach, worded; settled on it is worded by the pose. */
const BEACH_WALKS: { readonly [stage in BeachStage]: string } = {
  arriving: 'Walking to the beach',
  resting: 'On the beach',
  leaving: 'Walking back from the beach',
};

/** Something with a name the line can say: a venue or a lodging, as far as wording goes. */
interface Named {
  readonly label: string;
}

/**
 * What the router knows about one guest, as the plain facts {@link errandOf}
 * words. Shaped like the router's own answers so the caller hands them straight
 * over, and typed structurally so this module still never imports the router.
 */
export interface ErrandFacts {
  /** The venue they are inside or queueing at, or null. */
  readonly visit: {
    readonly venue: Named;
    readonly waiting: boolean;
    readonly place: number;
  } | null;
  /** The venue they are walking to, or null. */
  readonly goal: Named | null;
  /** The lodging they are asleep in or walking home to, or null. */
  readonly home: Named | null;
  readonly asleep: boolean;
  /** Where they are in a stay on the beach, or null while they are on none. */
  readonly beach: BeachStage | null;
}

/**
 * Which errand the facts add up to, most settled first: asleep, then on the
 * beach, then at a venue, then walking home, then walking anywhere else.
 *
 * The beach is ahead of a visit because a stay on it is one - the router counts
 * them inside the Beach - and the line should say what they are doing out
 * there rather than that they are inside it. Home is ahead of a goal because a
 * guest turned for bed keeps whatever venue their party had been walking to
 * until they next decide, and the line should say where they are actually
 * going.
 */
export function errandOf(facts: ErrandFacts): Errand {
  const { visit, goal, home } = facts;
  if (facts.asleep && home) return { kind: 'asleep', at: home.label };
  if (facts.beach) return { kind: 'beach', stage: facts.beach };
  if (visit?.waiting) return { kind: 'waiting', at: visit.venue.label, place: visit.place };
  if (visit) return { kind: 'inside', at: visit.venue.label };
  if (home) return { kind: 'walking', to: home.label, home: true };
  return goal ? { kind: 'walking', to: goal.label, home: false } : null;
}

/**
 * What somebody on an errand is doing, in the words the live line uses.
 *
 * The tile is left off the standing-still cases by the caller: somebody who
 * is not moving does not need their coordinates restated sixty times a second,
 * and the line is shorter and easier to read for it.
 */
function errandWording(errand: NonNullable<Errand>): string {
  if (errand.kind === 'walking') return `Walking ${errand.home ? 'home ' : ''}to the ${errand.to}`;
  if (errand.kind === 'inside') return `Inside the ${errand.at}`;
  if (errand.kind === 'asleep') return `Asleep at the ${errand.at}`;
  if (errand.kind === 'beach') return BEACH_WALKS[errand.stage];
  return `${placeWording(errand.place)} in the line at the ${errand.at}`;
}

/**
 * What somebody the simulation has put somewhere is doing there, with no tile,
 * or null for anybody on the move - whose line carries the tile.
 *
 * Settled on the beach reads as the pose they are in. A roamer, or somebody
 * lying on a lounger, on a visit to the beach they wander about in rather than
 * settle on, is on the move for this purpose: what they are doing says more
 * than "inside the Beach" would.
 */
function stillWording(
  crowd: Crowd,
  person: number,
  resting: number,
  errand: Errand,
): string | null {
  if (errand === null || errand.kind === 'walking') return null;
  if (errand.kind === 'beach') {
    if (errand.stage !== 'resting') return null;
    return `${resting === RESTING.sitting ? 'Sitting' : 'Lying'} on the beach`;
  }
  if (isRoaming(crowd, person) || resting === RESTING.lying) return null;
  return errandWording(errand);
}

/** What somebody not stood somewhere by the simulation is doing, in a word or a few. */
function doingNow(crowd: Crowd, person: number, resting: number, errand: Errand): string {
  if (resting === RESTING.sitting) return 'Sitting';
  if (resting === RESTING.lying) return 'Lying down';
  if (isRoaming(crowd, person)) return 'On the beach';
  // Where they are going, when somebody is routing them: "Walking" on its own
  // is what a guest with nowhere to be is doing, and it is the line plan 016
  // wrote.
  return errand === null ? 'Walking' : errandWording(errand);
}

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
 * `errand` is what the simulation has them doing, already decided. An
 * {@link Errand} rather than a router, for the reason this module takes a spot
 * rather than a crowd: what decides where anybody goes is not something the
 * wording of a line should be able to reach.
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
  errand: Errand,
): string {
  // A plot with its paving taken up walks nobody, though everybody still exists.
  if (person >= crowd.count) return 'Nowhere to walk';
  // No mood and no tile: a sleeping guest is not hungry at anybody, and their
  // coordinates are the inside of a building.
  if (errand?.kind === 'asleep') return errandWording(errand);
  const wanted = strongestNeed(needs, guests, person);
  const mood = wanted === null ? '' : `${NEED_MOODS[wanted.need]} · `;
  const resting = restingOn(crowd, person);
  // Standing in a line, sitting in a bakery or lying on the sand: where they
  // are is the place, and saying the tile again every frame is noise rather
  // than information.
  const still = stillWording(crowd, person, resting, errand);
  if (still !== null) return `${mood}${still}`;

  const doing = doingNow(crowd, person, resting, errand);
  const tileX = Math.floor(crowd.x[person]! / TILE_VOXELS);
  const tileZ = Math.floor(crowd.z[person]! / TILE_VOXELS);
  return `${mood}${doing} · tile ${tileX}, ${tileZ}`;
}
