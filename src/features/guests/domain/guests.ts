// Kept beside the crowd, keyed by person index, so crowd.ts keeps its branchless per-frame
// loop. Built to the requested count even for an empty crowd, so paving brings people back.

import { createRandom } from '../../layout/domain/random';
import { assignHomes, homeWithRoom, NO_HOME, type Home } from './homes';
import { givenName } from './names';
import { partiesFor, partyShapeFor, type Party } from './parties';

export interface GuestRecord {
  readonly given: string;
  readonly family: string;
}

export interface Guests {
  readonly count: number;
  readonly party: Int32Array;
  readonly home: Int32Array;
  // Spread over their stays for the opening guests, or the resort would empty all at once a week later.
  readonly arrivedOn: Int32Array;
  readonly nights: Int32Array;
  readonly child: Uint8Array;
  readonly variant: Int32Array;
  // A column rather than a shorter registry: a person index is a mesh body that is never
  // redrawn, so check-out empties a body and check-in refills it.
  readonly present: Uint8Array;
  // Kept rather than recounted: asked once per arriving party, and a recount is a pass over every guest.
  readonly freeBeds: Int32Array;
  readonly people: readonly GuestRecord[];
  // Entries are never removed, so a party index stays stable; the router keys on it.
  readonly parties: readonly Party[];
  readonly homes: readonly Home[];
}

// Built once per check-in pass: the free slots are the same for every party arriving that morning.
export interface FreeBodies {
  readonly adults: number[];
  readonly children: number[];
}

export interface GuestOptions {
  readonly count: number;
  readonly homes: readonly Home[];
  readonly variants: number;
  // Passed in because which people model is the child is a fact about the art in voxel-gen/.
  readonly childVariant: number;
  readonly seed: number;
}

export const STAY_NIGHTS = { min: 3, max: 14 } as const;

// Shifted past the child rather than redrawn until it misses, which never ends with one model.
function adultVariant(random: () => number, variants: number, childVariant: number): number {
  const excludes = childVariant >= 0 && childVariant < variants && variants > 1;
  const choices = excludes ? variants - 1 : Math.max(1, variants);
  const drawn = Math.min(choices - 1, Math.floor(random() * choices));
  return excludes && drawn >= childVariant ? drawn + 1 : drawn;
}

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

  // Drawn in a fixed order so changing one draw does not reshuffle the others.
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
    // One stay per party: they leave together.
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
    // Everybody starts present, so the opening scene, the seeded draws and the bench replay are
    // unchanged on frame one.
    present: new Uint8Array(count).fill(1),
    freeBeds,
    people,
    // Copied: this list grows, and partiesFor's result must not.
    parties: [...parties],
    homes,
  };
}

// The home is cleared, unlike the rest of the biography: a bed handed back but still pointed
// at would be two answers to one question.
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

export function freeBodiesOf(guests: Guests): FreeBodies {
  const free: FreeBodies = { adults: [], children: [] };
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1) continue;
    (guests.child[person] === 1 ? free.children : free.adults).push(person);
  }
  return free;
}

// The free bodies decide the party: with no adult body free it is not created, because a body
// is a mesh slot and nobody may be redrawn as somebody else. child and variant belong to the body.
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
  // Adults first, so a party cut to one person is never a child on holiday alone.
  const members = [
    ...free.adults.splice(0, Math.min(shape.adults, free.adults.length)),
    ...free.children.splice(0, Math.min(shape.children, free.children.length)),
  ];
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

export function presentCount(guests: Guests): number {
  let present = 0;
  for (let person = 0; person < guests.count; person++) present += guests.present[person]!;
  return present;
}

export function fullNameOf(guests: Guests, person: number): string {
  const record = guests.people[person]!;
  return `${record.given} ${record.family}`;
}

export function partyOf(guests: Guests, person: number): readonly number[] {
  return guests.parties[guests.party[person]!]!.members;
}

export function homeOf(guests: Guests, person: number): Home | null {
  const home = guests.home[person]!;
  return home === NO_HOME ? null : guests.homes[home]!;
}

export function bedCount(guests: Guests): { readonly beds: number; readonly taken: number } {
  const beds = guests.homes.reduce((sum, home) => sum + home.beds, 0);
  let taken = 0;
  for (let i = 0; i < guests.count; i++) {
    if (guests.present[i] === 1 && guests.home[i] !== NO_HOME) taken++;
  }
  return { beds, taken };
}
