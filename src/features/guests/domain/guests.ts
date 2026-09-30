// Kept beside the crowd, keyed by person index, so crowd.ts keeps its branchless per-frame
// loop. Built to the requested count even for an empty crowd, so paving brings people back.

import { createRandom } from '../../layout/domain/random';
import type { GuestsSnapshot } from '../../sim/domain/resortSnapshot';
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
  // Replaced, with homes, by `rehome` when lodgings are built or demolished.
  freeBeds: Int32Array;
  // Freed by a check-out and not yet made up: in neither freeBeds nor anybody's bed.
  unmade: Int32Array;
  // Replaced only by a load.
  people: readonly GuestRecord[];
  // Entries are never removed, so a party index stays stable; the router keys on it.
  parties: readonly Party[];
  homes: readonly Home[];
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
  // Nobody has checked in yet: a plot built by hand opens empty.
  readonly away?: boolean;
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
  const away = options.away === true;
  const assigned = assignHomes(parties, homes);
  const byParty = away ? new Int32Array(parties.length).fill(NO_HOME) : assigned.byParty;
  const freeBeds = away ? Int32Array.from(homes, (home) => home.beds) : assigned.freeBeds;

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
  // A party no lodging could take stays away, as check-in would turn it away: a guest with no bed
  // walks all night, and a plot paved for more people than it sleeps would open on a crowd of them.
  const present = new Uint8Array(count);
  for (let p = 0; p < parties.length; p++) {
    // One stay per party: they leave together.
    const stay = stayNights(random);
    const arrived = -Math.floor(random() * stay);
    for (const person of parties[p]!.members) {
      home[person] = byParty[p]!;
      nights[person] = stay;
      arrivedOn[person] = arrived;
      present[person] = byParty[p] === NO_HOME ? 0 : 1;
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
    present,
    freeBeds,
    unmade: new Int32Array(homes.length),
    people,
    // Copied: this list grows, and partiesFor's result must not.
    parties: [...parties],
    homes,
  };
}

// The home is cleared, unlike the rest of the biography: a bed handed back but still pointed
// at would be two answers to one question. A turnover leaves the bed for a cleaner to make up.
export function checkOutParty(guests: Guests, party: number, turnover = false): readonly number[] {
  const handedBack = turnover ? guests.unmade : guests.freeBeds;
  const members = guests.parties[party]?.members ?? [];
  const left: number[] = [];
  for (const person of members) {
    if (guests.present[person] !== 1) continue;
    guests.present[person] = 0;
    const home = guests.home[person]!;
    if (home !== NO_HOME) handedBack[home] = handedBack[home]! + 1;
    guests.home[person] = NO_HOME;
    left.push(person);
  }
  return left;
}

export function makeBeds(guests: Guests, home: number, most: number): number {
  if (home < 0 || home >= guests.unmade.length) return 0;
  const made = Math.max(0, Math.min(most, guests.unmade[home]!));
  guests.unmade[home] = guests.unmade[home]! - made;
  guests.freeBeds[home] = guests.freeBeds[home]! + made;
  return made;
}

export function unmadeCount(guests: Guests): number {
  return guests.unmade.reduce((sum, beds) => sum + beds, 0);
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

// Keyed, so an edit that leaves the lodgings alone leaves everybody where they sleep. Parties
// are re-housed in index order, so two runs agree. Answers how many present guests have no bed.
export function rehome(guests: Guests, homes: readonly Home[]): number {
  const freeBeds = Int32Array.from(homes, (home) => home.beds);
  const evicted = keepHomesByKey(guests, homes, freeBeds);
  // Before the evicted are re-housed, so nobody is put into a bed still waiting to be made up.
  const unmade = carryUnmade(guests, homes, freeBeds);
  for (const party of [...evicted].toSorted((a, b) => a - b)) rehouse(guests, party, freeBeds);
  guests.homes = homes;
  guests.freeBeds = freeBeds;
  guests.unmade = unmade;
  return homelessCount(guests);
}

// Answers the parties whose home is gone.
function keepHomesByKey(
  guests: Guests,
  homes: readonly Home[],
  freeBeds: Int32Array,
): ReadonlySet<number> {
  const byKey = new Map(homes.map((home, index) => [home.key, index]));
  const evicted = new Set<number>();
  for (let person = 0; person < guests.count; person++) {
    const old = guests.home[person]!;
    if (guests.present[person] !== 1 || old === NO_HOME) continue;
    const next = byKey.get(guests.homes[old]!.key) ?? NO_HOME;
    guests.home[person] = next;
    if (next === NO_HOME) evicted.add(guests.party[person]!);
    else freeBeds[next] = freeBeds[next]! - 1;
  }
  return evicted;
}

// A demolished lodging's unmade beds go with it.
function carryUnmade(guests: Guests, homes: readonly Home[], freeBeds: Int32Array): Int32Array {
  const before = new Map(guests.homes.map((home, index) => [home.key, guests.unmade[index] ?? 0]));
  const unmade = Int32Array.from(homes, (home, index) =>
    Math.max(0, Math.min(before.get(home.key) ?? 0, freeBeds[index]!)),
  );
  for (let home = 0; home < homes.length; home++) freeBeds[home] = freeBeds[home]! - unmade[home]!;
  return unmade;
}

function rehouse(guests: Guests, party: number, freeBeds: Int32Array): void {
  const members = guests.parties[party]!.members.filter(
    (person) => guests.present[person] === 1 && guests.party[person] === party,
  );
  const home = homeWithRoom(freeBeds, members.length);
  if (home !== NO_HOME) freeBeds[home] = freeBeds[home]! - members.length;
  for (const person of members) guests.home[person] = home;
}

export function homelessCount(guests: Guests): number {
  let homeless = 0;
  for (let person = 0; person < guests.count; person++) {
    if (guests.present[person] === 1 && guests.home[person] === NO_HOME) homeless++;
  }
  return homeless;
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

export function snapshotGuests(guests: Guests): GuestsSnapshot {
  return {
    count: guests.count,
    party: guests.party.slice(),
    home: guests.home.slice(),
    arrivedOn: guests.arrivedOn.slice(),
    nights: guests.nights.slice(),
    child: guests.child.slice(),
    variant: guests.variant.slice(),
    present: guests.present.slice(),
    freeBeds: guests.freeBeds.slice(),
    unmade: guests.unmade.slice(),
    people: guests.people.map((person) => ({ ...person })),
    parties: guests.parties.map((party) => ({ ...party, members: [...party.members] })),
    homes: guests.homes.map((home) => ({ ...home })),
  };
}

export function restoreGuests(guests: Guests, snapshot: GuestsSnapshot): void {
  guests.party.set(snapshot.party);
  guests.home.set(snapshot.home);
  guests.arrivedOn.set(snapshot.arrivedOn);
  guests.nights.set(snapshot.nights);
  guests.child.set(snapshot.child);
  guests.variant.set(snapshot.variant);
  guests.present.set(snapshot.present);
  guests.freeBeds = snapshot.freeBeds.slice();
  guests.unmade = snapshot.unmade.slice();
  guests.people = snapshot.people.map((person) => ({ ...person }));
  guests.parties = snapshot.parties.map((party) => ({ ...party, members: [...party.members] }));
  guests.homes = snapshot.homes.map((home) => ({ ...home }));
}
