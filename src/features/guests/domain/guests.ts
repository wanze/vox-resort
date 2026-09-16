/**
 * Who the people on the plot are.
 *
 * A registry parallel to the crowd and keyed by the same person index: guest `i`
 * is the person walking at `crowd.x[i]`. Deliberately **not** columns on the
 * crowd itself, for three reasons. `crowd.ts` exists to protect one branchless
 * per-frame loop, and nothing here is read per frame. `reseatCrowd` would have to
 * know which columns are graph indices to be reset and which are biography to be
 * carried, and getting that wrong silently deletes a guest's family. And a name
 * is a string, which has no business in a structure of arrays at all.
 *
 * ## What is a column and what is a record
 *
 * Anything the simulation will read in bulk - the party, the home, the arrival
 * day, the age band - is a typed column, so plan 016's needs can sit beside them
 * in the same shape. The names are records, read only when somebody is clicked
 * on, which happens once a second at the very most.
 *
 * ## More guests than walkers, sometimes
 *
 * `createCrowd` gives a plot with no paving a crowd of zero however many people
 * were asked for. The registry is built to the number asked for regardless, so
 * paving one tile brings a resort's worth of named people back rather than an
 * anonymous one. Read `crowd.count` for who is walking and `guests.count` for who
 * exists; on any plot with paving on it they are the same number.
 */

import { createRandom } from '../../layout/domain/random';
import { assignHomes, homeWithRoom, NO_HOME, type Home } from './homes';
import { givenName } from './names';
import { partiesFor, partyShapeFor, type Party } from './parties';

/** What a guest is called. Read only when somebody is looked at. */
export interface GuestRecord {
  readonly given: string;
  readonly family: string;
}

export interface Guests {
  readonly count: number;
  /** Party each person is in; index into {@link parties}. */
  readonly party: Int32Array;
  /** Where each person sleeps; index into {@link homes}, or `NO_HOME`. */
  readonly home: Int32Array;
  /**
   * Day each person arrived, relative to the day the resort opened.
   *
   * Negative for everybody present at the start, and spread over their own stay
   * lengths rather than all set to zero: a resort where every guest checked in
   * this morning empties all at once a week later.
   */
  readonly arrivedOn: Int32Array;
  /** Nights each person is staying. */
  readonly nights: Int32Array;
  /** 1 for a child, 0 for an adult. */
  readonly child: Uint8Array;
  /**
   * Which person model each is drawn with: what `crowd.variant` is set from, so
   * that a child is drawn as a child.
   */
  readonly variant: Int32Array;
  /**
   * 1 for somebody who is on the plot right now; 0 for a body waiting to be
   * filled.
   *
   * A column rather than a shorter registry, because a person index is a body
   * the crowd's meshes were built around and may never be redrawn: check-out
   * empties a body and check-in deals somebody new into it. See
   * `crowd/domain/crowdField.ts`, and `Crowd.offPlot`, which is the same fact
   * where the crowd can read it.
   */
  readonly present: Uint8Array;
  /**
   * Beds still free in each of {@link homes}, kept in step by check-in and
   * check-out.
   *
   * Kept rather than recounted, because {@link homeWithRoom} is asked of it once
   * per arriving party every morning and a recount is a pass over every guest.
   */
  readonly freeBeds: Int32Array;
  readonly people: readonly GuestRecord[];
  /**
   * Every party that has ever been on the plot, in the order they arrived.
   *
   * A departed party's entry stays where it is and a new one is pushed, so a
   * party index means the same thing for as long as the resort stands: the
   * router keys pitches, goals and bedtimes on it. See `sim/domain/night.ts`.
   */
  readonly parties: readonly Party[];
  readonly homes: readonly Home[];
}

/**
 * Free bodies to deal an arriving party into, by shape.
 *
 * Built once per check-in pass and spent as parties are dealt, because the
 * question - which slots are empty - is the same for every party arriving on
 * one morning, and answering it per party is a pass over the registry per
 * coach. See {@link checkInParty}.
 */
export interface FreeBodies {
  /** Person indices of empty adult bodies, and of empty child ones. */
  readonly adults: number[];
  readonly children: number[];
}

export interface GuestOptions {
  readonly count: number;
  /**
   * The lodging standing on the plot, beds and all, sorted by beds descending.
   * Empty is a resort nobody can sleep in, which is a plot with no houses on it
   * rather than a mistake.
   */
  readonly homes: readonly Home[];
  /** How many person models the scene can draw, i.e. `PEOPLE_MODELS.length`. */
  readonly variants: number;
  /**
   * Which variant is the child model.
   *
   * Passed in rather than looked up, because the people registry lives in
   * `voxel-gen/` and which entry of it is the child is a fact about the art. The
   * caller reads it off `PEOPLE_MODELS` by id; see `showcase.ts`.
   */
  readonly childVariant: number;
  readonly seed: number;
}

/** How long a stay runs, in nights. */
export const STAY_NIGHTS = { min: 3, max: 14 } as const;

/**
 * An adult's model: any variant but the child's.
 *
 * Drawn from the variants with the child's taken out, and shifted past it,
 * rather than redrawn until it misses - a loop that could never miss when there
 * is only the one model.
 */
function adultVariant(random: () => number, variants: number, childVariant: number): number {
  const excludes = childVariant >= 0 && childVariant < variants && variants > 1;
  const choices = excludes ? variants - 1 : Math.max(1, variants);
  const drawn = Math.min(choices - 1, Math.floor(random() * choices));
  return excludes && drawn >= childVariant ? drawn + 1 : drawn;
}

/**
 * How long one stay runs, drawn from {@link STAY_NIGHTS}.
 *
 * One rule for the parties who opened the plot and for everybody who checks in
 * afterwards, so a guest arriving on day six stays the way the first ones did.
 */
function stayNights(random: () => number): number {
  return (
    STAY_NIGHTS.min +
    Math.min(
      STAY_NIGHTS.max - STAY_NIGHTS.min,
      Math.floor(random() * (STAY_NIGHTS.max - STAY_NIGHTS.min + 1)),
    )
  );
}

export function createGuests(options: GuestOptions): Guests {
  const count = Math.max(0, Math.floor(options.count));
  const { homes, variants, childVariant } = options;
  const random = createRandom(options.seed);

  // Drawn in a fixed order - parties, then names, then stays - so that changing
  // how one of them is drawn does not reshuffle the others more than it must.
  const { parties, party, child } = partiesFor({ count, random });
  const { byParty, freeBeds } = assignHomes(parties, homes);

  const variant = new Int32Array(count);
  const people: GuestRecord[] = [];
  for (let i = 0; i < count; i++) {
    const isChild = child[i] === 1;
    people.push({ given: givenName(random, isChild), family: parties[party[i]!]!.family });
    variant[i] = isChild
      ? Math.max(0, Math.min(variants - 1, childVariant))
      : adultVariant(random, variants, childVariant);
  }

  const home = new Int32Array(count);
  const arrivedOn = new Int32Array(count);
  const nights = new Int32Array(count);
  for (let p = 0; p < parties.length; p++) {
    // One stay per party: they came together and they leave together.
    const stay = stayNights(random);
    const arrived = -Math.floor(random() * stay);
    for (const person of parties[p]!.members) {
      home[person] = byParty[p]!;
      nights[person] = stay;
      arrivedOn[person] = arrived;
    }
  }

  return {
    count,
    party,
    home,
    arrivedOn,
    nights,
    child,
    variant,
    // Everybody starts present, exactly as before this was a column: the opening
    // scene, the seeded draws and the benchmark's replay are all untouched on
    // frame one, and the plot only begins to change once a stay runs out.
    present: new Uint8Array(count).fill(1),
    freeBeds,
    people,
    // Copied into an array of this module's own: a departed party's entry stays
    // where it is and an arriving one is pushed, so `partiesFor`'s result is not
    // the list that grows. See {@link Guests.parties}.
    parties: [...parties],
    homes,
  };
}

/**
 * Takes a party off the plot: their beds go back, their slots go into the free
 * pool, and their names stay until somebody else is dealt into the same bodies.
 *
 * Hands back the person indices that just left, so the caller can stand them
 * down and the crowd can stop drawing them.
 *
 * Their home **is** cleared, unlike the rest of their biography: a bed handed
 * back and still pointed at is two answers to one question, and it is the one
 * everything else reads - `homeOf`, the router's `findHomes`, and the resident
 * list the inspector shows for a lodging.
 */
export function checkOutParty(guests: Guests, party: number): readonly number[] {
  const members = guests.parties[party]?.members ?? [];
  const left: number[] = [];
  for (const person of members) {
    if (guests.present[person] !== 1) continue;
    guests.present[person] = 0;
    const home = guests.home[person]!;
    if (home !== NO_HOME) guests.freeBeds[home] = guests.freeBeds[home]! + 1;
    guests.home[person] = NO_HOME;
    left.push(person);
  }
  return left;
}

/** Every empty body on the plot, adults and children apart. See {@link FreeBodies}. */
export function freeBodiesOf(guests: Guests): FreeBodies {
  const free: FreeBodies = { adults: [], children: [] };
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1) continue;
    (guests.child[person] === 1 ? free.children : free.adults).push(person);
  }
  return free;
}

/**
 * Deals a new party into free slots, and gives it a home if one has room.
 *
 * The draw asks for a shape the way the opening resort's parties were drawn -
 * see `partyShapeFor`. **The bodies decide what it gets**: a family wanting two
 * adults and three children with only one child body free arrives as a family of
 * three. A party that cannot be given even one adult body is not created at all
 * and null comes back, because a body is a mesh slot and nobody may be redrawn
 * as somebody else - see "A slot's body never changes" and `crowdField.ts`.
 *
 * `child` and `variant` are never written: they are the body's, and they are
 * what chose the slot.
 */
export function checkInParty(
  guests: Guests,
  options: {
    readonly random: () => number;
    readonly day: number;
    readonly free: FreeBodies;
  },
): Party | null {
  const { random, day, free } = options;
  const shape = partyShapeFor(random);
  // Adults first, so `Party.members` is adults first and a party cut to one
  // person is one adult - never a child on holiday alone, as `partiesFor` puts it.
  const members = [
    ...free.adults.splice(0, Math.min(shape.adults, free.adults.length)),
    ...free.children.splice(0, Math.min(shape.children, free.children.length)),
  ];
  // No adult body free, so there is nobody to bring the children: whatever was
  // taken goes back where it came from and the coach arrives without them.
  if (members.length === 0 || guests.child[members[0]!] === 1) {
    free.children.unshift(...members);
    return null;
  }
  const party: Party = { kind: shape.kind, family: shape.family, members };
  const index = guests.parties.length;
  (guests.parties as Party[]).push(party);

  const home = homeWithRoom(guests.freeBeds, members.length);
  if (home !== NO_HOME) guests.freeBeds[home] = guests.freeBeds[home]! - members.length;
  const nights = stayNights(random);
  const people = guests.people as GuestRecord[];
  for (const person of members) {
    guests.party[person] = index;
    guests.home[person] = home;
    guests.arrivedOn[person] = day;
    guests.nights[person] = nights;
    guests.present[person] = 1;
    people[person] = {
      given: givenName(random, guests.child[person] === 1),
      family: shape.family,
    };
  }
  return party;
}

/** How many of the bodies the plot was built for are holding a guest right now. */
export function presentCount(guests: Guests): number {
  let present = 0;
  for (let person = 0; person < guests.count; person++) present += guests.present[person]!;
  return present;
}

/** `"Elena Marchetti"`, for the HUD. */
export function fullNameOf(guests: Guests, person: number): string {
  const record = guests.people[person]!;
  return `${record.given} ${record.family}`;
}

/** Everybody in the same party as this person, themselves included. */
export function partyOf(guests: Guests, person: number): readonly number[] {
  return guests.parties[guests.party[person]!]!.members;
}

/** Where this person sleeps, or null when they have nowhere. */
export function homeOf(guests: Guests, person: number): Home | null {
  const home = guests.home[person]!;
  return home === NO_HOME ? null : guests.homes[home]!;
}

/** Beds on the plot, and how many of them are spoken for. */
export function bedCount(guests: Guests): { readonly beds: number; readonly taken: number } {
  const beds = guests.homes.reduce((sum, home) => sum + home.beds, 0);
  let taken = 0;
  for (let i = 0; i < guests.count; i++) {
    if (guests.present[i] === 1 && guests.home[i] !== NO_HOME) taken++;
  }
  return { beds, taken };
}
