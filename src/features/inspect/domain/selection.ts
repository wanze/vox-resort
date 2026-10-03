// A flat, pre-worded value handed to React once per click, so the panel never
// re-renders on a tick. The per-frame activity line goes to the DOM through a ref.

import {
  GUEST_NEEDS,
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
import { WAGES, type StaffRole } from '../../sim/domain/staff';
import { strongestNeed, type Needs } from '../../sim/domain/needs';
import type { ThoughtKind } from '../../sim/domain/thoughts';
import { isNamed, type Venue } from '../../sim/domain/venues';
import { NO_ZONE } from '../../sim/domain/zones';
import { roleTitle, staffName, taskWords, type TaskFacts } from './staffWords';

export type InspectTarget =
  | { readonly person: number }
  | { readonly worker: number }
  | { readonly key: string }
  | null;

export function personOf(target: InspectTarget): number | null {
  return target !== null && 'person' in target ? target.person : null;
}

export function placementKeyOf(target: InspectTarget): string | null {
  return target !== null && 'key' in target ? target.key : null;
}

export function workerOf(target: InspectTarget): number | null {
  return target !== null && 'worker' in target ? target.worker : null;
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
  readonly thought: { readonly kind: ThoughtKind; readonly subject: string | null } | null;
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
    readonly takings: number;
    // Null where nobody swims, so the inspector has nothing to say about a lifeguard.
    readonly watched: boolean | null;
    // Broken is closed: guests are turned away until a mechanic has been.
    readonly broken: boolean;
  } | null;
  readonly residents: readonly PartyMemberView[];
  // Who the player may send there; set by the showcase, which knows the roster and the orders.
  readonly send?: SendOffers;
  // Set by the showcase on a venue, which the player may rename; `label` is then its name.
  readonly naming?: VenueNaming;
}

export interface VenueNaming {
  readonly kind: string;
  readonly named: boolean;
  // The model suggests names, so an emptied name draws another rather than going back to `kind`.
  readonly suggested: boolean;
}

// Null where the role has nothing to do there.
export type SendState = 'ready' | 'nobody' | 'sent';

export interface SendOffers {
  readonly mechanic: SendState | null;
  readonly cleaner: SendState | null;
}

export interface SendFacts {
  readonly broken: boolean;
  readonly dirty: boolean;
  readonly onDuty: { readonly mechanic: number; readonly cleaner: number };
  readonly sent: { readonly mechanic: boolean; readonly cleaner: boolean };
}

function sendState(wanted: boolean, onDuty: number, sent: boolean): SendState | null {
  if (!wanted) return null;
  if (sent) return 'sent';
  return onDuty > 0 ? 'ready' : 'nobody';
}

export const sendOffers = (facts: SendFacts): SendOffers => ({
  mechanic: sendState(facts.broken, facts.onDuty.mechanic, facts.sent.mechanic),
  cleaner: sendState(facts.dirty, facts.onDuty.cleaner, facts.sent.cleaner),
});

// What the task is, worded, goes to the activity line per frame; this is what holds still.
export interface StaffView {
  readonly kind: 'staff';
  readonly worker: number;
  readonly role: StaffRole;
  readonly roleTitle: string;
  readonly name: string;
  readonly zone: string;
  readonly onDuty: boolean;
  readonly wage: number;
}

export type SelectionView = GuestView | PlaceView | StaffView;

export function staffView(
  roles: readonly StaffRole[],
  worker: number,
  zone: number,
  onDuty: boolean,
): StaffView {
  const role = roles[worker]!;
  return {
    kind: 'staff',
    worker,
    role,
    roleTitle: roleTitle(role),
    name: staffName(roles, worker),
    zone: zone === NO_ZONE ? 'Everywhere' : `Zone ${zone + 1}`,
    onDuty,
    wage: WAGES[role],
  };
}

const NEED_LABELS: { readonly [need in GuestNeed]: string } = {
  hunger: 'Hunger',
  thirst: 'Thirst',
  energy: 'Energy',
  fun: 'Fun',
  hygiene: 'Hygiene',
  health: 'Health',
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

// Health only once it is down: a full health bar on every guest says nothing.
function needsShown(needs: Needs, person: number): GuestView['needs'] {
  const shown = GUEST_NEEDS.map((need) => ({ need, level: needs.level[need][person]! }));
  const health = needs.level.health[person]!;
  return health < 1 ? [...shown, { need: 'health', level: health }] : shown;
}

export function guestView(
  guests: Guests,
  needs: Needs,
  happiness: Happiness,
  venues: readonly Venue[],
  person: number,
  day: number,
  at: GuestSpot,
  thought: GuestView['thought'],
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
    needs: needsShown(needs, person),
    wants: wantsOf({ guests, needs, venues, person, at }),
    happiness: happiness.level[person] ?? 0,
    thought,
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
  takings = 0,
  watched = false,
  broken = false,
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
          takings,
          watched: venue.bathing === true ? watched : null,
          broken,
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
  health: 'Hurt',
};

const PLACES: readonly string[] = ['First', 'Second', 'Third', 'Fourth'];

export function placeWording(slot: number): string {
  return PLACES[slot] ?? `${slot + 1}th`;
}

// `named` only on a venue with a name of its own, which reads without "the".
export type Errand =
  | { readonly kind: 'walking'; readonly to: string; readonly home: boolean; readonly named?: true }
  | { readonly kind: 'waiting'; readonly at: string; readonly place: number; readonly named?: true }
  | { readonly kind: 'inside'; readonly at: string; readonly named?: true }
  | { readonly kind: 'asleep'; readonly at: string }
  | { readonly kind: 'beach'; readonly stage: BeachStage }
  | { readonly kind: 'checking-in'; readonly at: string; readonly named?: true }
  | null;

type BeachStage = 'arriving' | 'resting' | 'leaving';

const BEACH_WALKS: { readonly [stage in BeachStage]: string } = {
  arriving: 'Walking to the beach',
  resting: 'On the beach',
  leaving: 'Walking back from the beach',
};

interface Named {
  readonly label: string;
  readonly kind?: string;
}

const namedIf = (place: Named): { readonly named?: true } =>
  isNamed(place) ? { named: true } : {};

const refer = (label: string, named: true | undefined): string => (named ? label : `the ${label}`);

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
  if (desk) return { kind: 'checking-in', at: desk.label, ...namedIf(desk) };
  if (visit?.waiting) {
    return { kind: 'waiting', at: visit.venue.label, place: visit.place, ...namedIf(visit.venue) };
  }
  if (visit) return { kind: 'inside', at: visit.venue.label, ...namedIf(visit.venue) };
  if (home) return { kind: 'walking', to: home.label, home: true };
  return goal ? { kind: 'walking', to: goal.label, home: false, ...namedIf(goal) } : null;
}

function errandWording(errand: NonNullable<Errand>): string {
  if (errand.kind === 'walking') {
    return `Walking ${errand.home ? 'home ' : ''}to ${refer(errand.to, errand.named)}`;
  }
  if (errand.kind === 'inside') return `Inside ${refer(errand.at, errand.named)}`;
  if (errand.kind === 'asleep') return `Asleep at the ${errand.at}`;
  if (errand.kind === 'beach') return BEACH_WALKS[errand.stage];
  if (errand.kind === 'checking-in') return `Checking in at ${refer(errand.at, errand.named)}`;
  return `${placeWording(errand.place)} in the line at ${refer(errand.at, errand.named)}`;
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

// Per frame for the inspected worker, as activityLine is for a guest. The cart is a cleaner's
// alone, and nobody off duty has a tile worth naming.
export function staffLine(
  facts: TaskFacts,
  load: number,
  spellsPerLoad: number,
  at: { readonly x: number; readonly z: number },
): string {
  const words = taskWords(facts);
  if (facts.kind === 'off') return words;
  const cart = facts.role === 'cleaner' ? ` · cart ${load} of ${spellsPerLoad}` : '';
  const tileX = Math.floor(at.x / TILE_VOXELS);
  const tileZ = Math.floor(at.z / TILE_VOXELS);
  return `${words}${cart} · tile ${tileX}, ${tileZ}`;
}
