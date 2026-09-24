// A flat, pre-worded value handed to React once per click, so the panel never
// re-renders on a tick. The per-frame activity line goes to the DOM through a ref.

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

export type InspectTarget = { readonly person: number } | { readonly key: string } | null;

export function personOf(target: InspectTarget): number | null {
  return target !== null && 'person' in target ? target.person : null;
}

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
  readonly partyKind: PartyKind;
  readonly family: string;
  readonly members: readonly PartyMemberView[];
  readonly home: { readonly key: string; readonly label: string } | null;
  readonly arrivedOn: number;
  readonly nights: number;
  readonly nightsLeft: number;
  readonly needs: readonly { readonly need: GuestNeed; readonly level: number }[];
  readonly wants: { readonly need: GuestNeed; readonly label: string } | null;
  readonly happiness: number;
}

export interface PlaceView {
  readonly kind: 'place';
  readonly key: string;
  readonly id: string;
  readonly label: string;
  readonly tile: { readonly x: number; readonly z: number };
  // 0 to 1: how pleasant its surroundings are. A bench has a setting as much as a hotel.
  readonly setting: number;
  readonly venue: {
    readonly role: VenueRole;
    readonly capacity: number;
    readonly serves: readonly string[];
    readonly dwell: string;
    readonly beds: number;
    readonly inside: number;
    readonly waiting: number;
    readonly cleanliness: number;
  } | null;
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

function dwellWording({ min, max }: ModelVenue['dwellSeconds']): string {
  const [unit, suffix] = min >= HOUR ? [HOUR, 'h'] : [MINUTE, 'min'];
  const from = Math.round(min / unit);
  const to = Math.round(max / unit);
  return from === to ? `${from} ${suffix}` : `${from} to ${to} ${suffix}`;
}

function memberOf(guests: Guests, person: number): PartyMemberView {
  return { person, name: fullNameOf(guests, person), child: guests.child[person] === 1 };
}

export interface GuestSpot {
  readonly x: number;
  readonly z: number;
}

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

export interface PlaceOccupancy {
  readonly inside: number;
  readonly waiting: number;
}

export function placeView(
  placement: Placement,
  label: string,
  guests: Guests,
  occupancy: PlaceOccupancy | null,
  setting: number,
  // Null means spotless: a fixture, or a venue so new the router has not seen it.
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
    setting,
    venue: venue
      ? {
          role: venue.role,
          capacity: venue.capacity,
          serves: (venue.satisfies ?? []).map((relief) => NEED_LABELS[relief.need]),
          dwell: dwellWording(venue.dwellSeconds),
          beds: venue.beds ?? 0,
          inside: occupancy?.inside ?? 0,
          waiting: occupancy?.waiting ?? 0,
          cleanliness: cleanliness ?? 1,
        }
      : null,
    residents,
  };
}

const NEED_MOODS: { readonly [need in GuestNeed]: string } = {
  hunger: 'Hungry',
  thirst: 'Thirsty',
  energy: 'Tired',
  fun: 'Bored',
  hygiene: 'Grubby',
};

const PLACES: readonly string[] = ['First', 'Second', 'Third', 'Fourth'];

export function placeWording(slot: number): string {
  return PLACES[slot] ?? `${slot + 1}th`;
}

export type Errand =
  | { readonly kind: 'walking'; readonly to: string; readonly home: boolean }
  | { readonly kind: 'waiting'; readonly at: string; readonly place: number }
  | { readonly kind: 'inside'; readonly at: string }
  | { readonly kind: 'asleep'; readonly at: string }
  | { readonly kind: 'beach'; readonly stage: BeachStage }
  | { readonly kind: 'checking-in'; readonly at: string }
  | null;

type BeachStage = 'arriving' | 'resting' | 'leaving';

const BEACH_WALKS: { readonly [stage in BeachStage]: string } = {
  arriving: 'Walking to the beach',
  resting: 'On the beach',
  leaving: 'Walking back from the beach',
};

interface Named {
  readonly label: string;
}

// Typed structurally so this module never imports the router.
export interface ErrandFacts {
  readonly visit: {
    readonly venue: Named;
    readonly waiting: boolean;
    readonly place: number;
  } | null;
  readonly goal: Named | null;
  readonly home: Named | null;
  readonly asleep: boolean;
  readonly beach: BeachStage | null;
  readonly checkingIn?: boolean;
}

// Beach before a visit, because the router counts a beach stay as inside the Beach.
// Home before a goal, because a guest turned for bed keeps their party's stale goal.
export function errandOf(facts: ErrandFacts): Errand {
  const { visit, goal, home } = facts;
  if (facts.asleep && home) return { kind: 'asleep', at: home.label };
  if (facts.beach) return { kind: 'beach', stage: facts.beach };
  // The desk may be the goal or the visit; a walk home at night goes first either way.
  const desk = facts.checkingIn && !home ? (visit?.venue ?? goal) : null;
  if (desk) return { kind: 'checking-in', at: desk.label };
  if (visit?.waiting) return { kind: 'waiting', at: visit.venue.label, place: visit.place };
  if (visit) return { kind: 'inside', at: visit.venue.label };
  if (home) return { kind: 'walking', to: home.label, home: true };
  return goal ? { kind: 'walking', to: goal.label, home: false } : null;
}

function errandWording(errand: NonNullable<Errand>): string {
  if (errand.kind === 'walking') return `Walking ${errand.home ? 'home ' : ''}to the ${errand.to}`;
  if (errand.kind === 'inside') return `Inside the ${errand.at}`;
  if (errand.kind === 'asleep') return `Asleep at the ${errand.at}`;
  if (errand.kind === 'beach') return BEACH_WALKS[errand.stage];
  if (errand.kind === 'checking-in') return `Checking in at the ${errand.at}`;
  return `${placeWording(errand.place)} in the line at the ${errand.at}`;
}

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

function doingNow(crowd: Crowd, person: number, resting: number, errand: Errand): string {
  if (resting === RESTING.sitting) return 'Sitting';
  if (resting === RESTING.lying) return 'Lying down';
  if (isRoaming(crowd, person)) return 'On the beach';
  return errand === null ? 'Walking' : errandWording(errand);
}

// Allocates a short string per frame on purpose: only for the selected guest, and
// the overlay skips unchanged DOM writes.
export function activityLine(
  crowd: Crowd,
  needs: Needs,
  guests: Guests,
  person: number,
  errand: Errand,
): string {
  if (person >= crowd.count) return 'Nowhere to walk';
  if (errand?.kind === 'asleep') return errandWording(errand);
  const wanted = strongestNeed(needs, guests, person);
  const mood = wanted === null ? '' : `${NEED_MOODS[wanted.need]} · `;
  const resting = restingOn(crowd, person);
  const still = stillWording(crowd, person, resting, errand);
  if (still !== null) return `${mood}${still}`;

  const doing = doingNow(crowd, person, resting, errand);
  const tileX = Math.floor(crowd.x[person]! / TILE_VOXELS);
  const tileZ = Math.floor(crowd.z[person]! / TILE_VOXELS);
  return `${mood}${doing} · tile ${tileX}, ${tileZ}`;
}
