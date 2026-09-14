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
import { assignHomes, NO_HOME, type Home } from './homes';
import { givenName } from './names';
import { partiesFor, type Party } from './parties';

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
  readonly people: readonly GuestRecord[];
  readonly parties: readonly Party[];
  readonly homes: readonly Home[];
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

export function createGuests(options: GuestOptions): Guests {
  const count = Math.max(0, Math.floor(options.count));
  const { homes, variants, childVariant } = options;
  const random = createRandom(options.seed);

  // Drawn in a fixed order - parties, then names, then stays - so that changing
  // how one of them is drawn does not reshuffle the others more than it must.
  const { parties, party, child } = partiesFor({ count, random });
  const { byParty } = assignHomes(parties, homes);

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
    const stay =
      STAY_NIGHTS.min +
      Math.min(
        STAY_NIGHTS.max - STAY_NIGHTS.min,
        Math.floor(random() * (STAY_NIGHTS.max - STAY_NIGHTS.min + 1)),
      );
    const arrived = -Math.floor(random() * stay);
    for (const person of parties[p]!.members) {
      home[person] = byParty[p]!;
      nights[person] = stay;
      arrivedOn[person] = arrived;
    }
  }

  return { count, party, home, arrivedOn, nights, child, variant, people, parties, homes };
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
  for (let i = 0; i < guests.count; i++) if (guests.home[i] !== NO_HOME) taken++;
  return { beds, taken };
}
