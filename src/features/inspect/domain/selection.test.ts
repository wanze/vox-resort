import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  createCrowd,
  isRoaming,
  RESTING,
  restingOn,
  stepCrowd,
  type Crowd,
} from '../../crowd/domain/crowd';
import type { SeatSpot } from '../../crowd/domain/seating';
import { walkingSurface, walkNetworkFor, type PavedTile } from '../../crowd/domain/walkNetwork';
import { createGuests, fullNameOf, type Guests } from '../../guests/domain/guests';
import { NO_HOME, type Home } from '../../guests/domain/homes';
import { shoreFor } from '../../layout/domain/shoreline';
import type { Placement } from '../../layout/domain/resortLayout';
import { createNeeds, NEEDS, type Needs } from '../../sim/domain/needs';
import { venuesOn, type Venue } from '../../sim/domain/venues';
import {
  activityLine,
  guestView,
  namesPlacement,
  personOf,
  placeView,
  placeWording,
  type Errand,
  type GuestSpot,
  type InspectTarget,
} from './selection';

describe('what a selection names', () => {
  const nothing: InspectTarget = null;

  it('reads the person out of a guest, and nobody out of anything else', () => {
    expect(personOf({ person: 0 })).toBe(0);
    expect(personOf({ person: 41 })).toBe(41);
    expect(personOf({ key: 'bungalow#0' })).toBeNull();
    expect(personOf(nothing)).toBeNull();
  });

  it('matches a placement by its key alone', () => {
    expect(namesPlacement({ key: 'bungalow#0' }, 'bungalow#0')).toBe(true);
    expect(namesPlacement({ key: 'bungalow#0' }, 'bungalow#1')).toBe(false);
    expect(namesPlacement({ person: 0 }, 'bungalow#0')).toBe(false);
    expect(namesPlacement(nothing, 'bungalow#0')).toBe(false);
  });
});

const home = (key: string, id: string, beds: number): Home => ({ key, id, label: id, beds });

const HOMES: readonly Home[] = [home('hotel#0', 'hotel', 40), home('bungalow#0', 'bungalow', 4)];

/** More people than beds, so somebody is certainly left without one. */
const guestsOf = (count = 80): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed: 5 });

/** Needs as they were drawn, or with one person moved to a mood of their own. */
const needsOf = (guests: Guests, level: number | null = null, person = 0): Needs => {
  const needs = createNeeds(guests, 7);
  if (level !== null) for (const need of NEEDS) needs.level[need][person] = level;
  return needs;
};

const HERE: GuestSpot = { x: 0, z: 0 };

const NO_VENUES: readonly Venue[] = [];

/** Standing at a venue's own door, so the distance to it is nothing. */
const doorOf = (venue: Venue): GuestSpot => ({ x: venue.x, z: venue.z });

const at = (key: string, id: string, tileX = 3, tileZ = 7): Placement => ({
  key,
  id,
  tileX,
  tileZ,
  tilesX: 1,
  tilesZ: 1,
  rotation: 0,
  x: tileX * TILE_VOXELS,
  z: tileZ * TILE_VOXELS,
  y: 0,
  width: TILE_VOXELS,
  depth: TILE_VOXELS,
});

describe('guestView', () => {
  it('names the guest and lists their whole party, themselves included, in party order', () => {
    const guests = guestsOf();
    // Somebody in a party of more than one, so the order is worth checking.
    const person = Array.from({ length: guests.count }, (_, i) => i).find(
      (i) => guests.parties[guests.party[i]!]!.members.length > 2,
    )!;
    const view = guestView(guests, needsOf(guests), NO_VENUES, person, 0, HERE);
    const party = guests.parties[guests.party[person]!]!;
    expect(view.kind).toBe('guest');
    expect(view.name).toBe(fullNameOf(guests, person));
    expect(view.family).toBe(party.family);
    expect(view.partyKind).toBe(party.kind);
    expect(view.members.map((member) => member.person)).toEqual(party.members);
    expect(view.members.map((member) => member.person)).toContain(person);
    for (const member of view.members) {
      expect(member.name).toBe(fullNameOf(guests, member.person));
      expect(member.child).toBe(guests.child[member.person] === 1);
    }
  });

  it('gives a guest with nowhere to sleep no home', () => {
    const guests = guestsOf();
    const homeless = guests.home.indexOf(NO_HOME);
    expect(homeless, 'everybody had a bed').toBeGreaterThanOrEqual(0);
    const needs = needsOf(guests);
    expect(guestView(guests, needs, NO_VENUES, homeless, 0, HERE).home).toBeNull();
    const housed = guests.home.findIndex((index) => index !== NO_HOME);
    const view = guestView(guests, needs, NO_VENUES, housed, 0, HERE);
    expect(view.home).toEqual({
      key: guests.homes[guests.home[housed]!]!.key,
      label: guests.homes[guests.home[housed]!]!.label,
    });
  });

  it('counts the nights left from the day it is, past zero once the stay is over', () => {
    const guests = guestsOf();
    const needs = needsOf(guests);
    const view = (day: number) => guestView(guests, needs, NO_VENUES, 0, day, HERE);
    const { arrivedOn, nights } = view(0);
    expect(view(0).nightsLeft).toBe(arrivedOn + nights);
    expect(view(4).nightsLeft).toBe(arrivedOn + nights - 4);
    expect(view(arrivedOn + nights + 2).nightsLeft).toBe(-2);
  });

  it('carries all five need levels, in the order the HUD lists them', () => {
    const guests = guestsOf();
    const needs = needsOf(guests);
    const view = guestView(guests, needs, NO_VENUES, 3, 0, HERE);
    expect(view.needs.map((entry) => entry.need)).toEqual([...NEEDS]);
    for (const entry of view.needs) {
      expect(entry.level).toBeCloseTo(needs.level[entry.need][3]!, 5);
    }
  });

  it('wants nothing from a guest who has everything', () => {
    const guests = guestsOf();
    const bakery = venuesOn([at('bakery#0', 'bakery')]);
    expect(guestView(guests, needsOf(guests, 1, 3), bakery, 3, 0, HERE).wants).toBeNull();
  });

  it('names the bakery for a hungry guest, and nowhere when none is standing', () => {
    const guests = guestsOf();
    const needs = needsOf(guests, 0, 3);
    const bakery = venuesOn([at('bakery#0', 'bakery')]);
    expect(guestView(guests, needs, bakery, 3, 0, HERE).wants).toEqual({
      need: 'hunger',
      label: 'Bakery',
    });
    expect(guestView(guests, needs, NO_VENUES, 3, 0, HERE).wants).toBeNull();
  });

  it('chooses from where the guest is standing, not from the corner of the plot', () => {
    const guests = guestsOf();
    const needs = needsOf(guests, 0, 3);
    // A bakery at one end of the plot and a restaurant at the other, both of
    // them somewhere to eat: whoever is at the door wins.
    const venues = venuesOn([
      at('bakery#0', 'bakery', 1, 1),
      at('restaurant#0', 'restaurant', 90, 1),
    ]);
    expect(guestView(guests, needs, venues, 3, 0, doorOf(venues[0]!)).wants?.label).toBe('Bakery');
    expect(guestView(guests, needs, venues, 3, 0, doorOf(venues[1]!)).wants?.label).toBe(
      'Restaurant',
    );
  });
});

describe('placeView', () => {
  it('lists exactly the guests who sleep in a bungalow', () => {
    const guests = guestsOf();
    const view = placeView(at('bungalow#0', 'bungalow'), 'Bungalow', guests, null);
    const sleepers = Array.from({ length: guests.count }, (_, i) => i).filter(
      (i) => guests.home[i] === 1,
    );
    expect(sleepers.length).toBeGreaterThan(0);
    expect(view.residents.map((resident) => resident.person)).toEqual(sleepers);
    expect(view.venue?.role).toBe('lodging');
    expect(view.venue?.beds).toBe(4);
    expect(view.venue?.serves).toEqual([]);
    expect(view.tile).toEqual({ x: 3, z: 7 });
  });

  it('has nothing to say about a bench', () => {
    const view = placeView(at('bench#2', 'bench'), 'Bench', guestsOf(), null);
    expect(view.venue).toBeNull();
    expect(view.residents).toEqual([]);
  });

  it('says what a restaurant seats and serves, and houses nobody', () => {
    const view = placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guestsOf(), null);
    expect(view.venue?.role).toBe('food');
    expect(view.venue?.capacity).toBe(40);
    expect(view.venue?.serves).toEqual(['Hunger', 'Thirst']);
    expect(view.residents).toEqual([]);
  });

  it('words a short visit in minutes and a night in hours', () => {
    // The restaurant's half hour to an hour, and the bungalow's seven to nine
    // hours: the two units a stay is thought of in.
    const guests = guestsOf();
    expect(
      placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guests, null).venue?.dwell,
    ).toBe('30 to 60 min');
    expect(placeView(at('bungalow#0', 'bungalow'), 'Bungalow', guests, null).venue?.dwell).toBe(
      '7 to 9 h',
    );
  });
});

/** A street running east, with one seat of the given pose beside its middle tile. */
const seatedStreet = (pose: SeatSpot['pose']): Crowd => {
  const paved: PavedTile[] = Array.from({ length: 9 }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));
  const seat: SeatSpot = {
    x: 4.5 * TILE_VOXELS,
    z: TILE_VOXELS * 1.5,
    y: walkingSurface(0) + 2,
    heading: Math.PI,
    pose,
    tileX: 4,
    tileZ: 1,
  };
  const network = walkNetworkFor({
    paved,
    levelOf: () => 0,
    shore: null,
    tilesX: 20,
    seats: [seat],
  });
  return createCrowd({ network, count: 30, variants: 2, seed: 12 });
};

/** Steps the crowd until somebody matches, and hands them back. */
const until = (crowd: Crowd, matches: (i: number) => boolean): number => {
  for (let elapsed = 0; elapsed < 900; elapsed += 1 / 10) {
    stepCrowd(crowd, 1 / 10);
    for (let i = 0; i < crowd.count; i++) if (matches(i)) return i;
  }
  throw new Error('nobody ever did it');
};

/** Everybody content, so the wording under test is the doing and not the mood. */
const contentNeeds = (guests: Guests): Needs => {
  const needs = createNeeds(guests, 7);
  for (const need of NEEDS) needs.level[need].fill(1);
  return needs;
};

describe('activityLine', () => {
  const guests = guestsOf();
  const content = contentNeeds(guests);
  const doing = (crowd: Crowd, needs: Needs, person: number, errand: Errand = null): string =>
    activityLine(crowd, needs, guests, person, errand);

  /** Walking to the bakery, which is what plan 017's routing hands in. */
  const TO_BAKERY: Errand = { kind: 'walking', to: 'Bakery' };

  it('says somebody on the paving is walking, and where', () => {
    const crowd = seatedStreet('sit');
    const line = doing(crowd, content, 0);
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    expect(line).toBe(`Walking · tile ${tileX}, ${tileZ}`);
  });

  it('has nowhere to walk for somebody the paving no longer carries', () => {
    const crowd = seatedStreet('sit');
    expect(doing(crowd, content, crowd.count)).toBe('Nowhere to walk');
    expect(doing(crowd, content, crowd.count + 5)).toBe('Nowhere to walk');
  });

  it('puts the loudest need in front of what they are doing', () => {
    const crowd = seatedStreet('sit');
    const hungry = contentNeeds(guests);
    hungry.level.hunger[0] = 0;
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    expect(doing(crowd, hungry, 0)).toBe(`Hungry · Walking · tile ${tileX}, ${tileZ}`);
  });

  it('words each need as the one thing it is felt as', () => {
    const crowd = seatedStreet('sit');
    const moods = NEEDS.map((need) => {
      const needs = contentNeeds(guests);
      needs.level[need][0] = 0;
      return doing(crowd, needs, 0).split(' · ')[0];
    });
    expect(moods).toEqual(['Hungry', 'Thirsty', 'Tired', 'Bored', 'Grubby']);
  });

  it('says where they are heading, once something is routing them', () => {
    const crowd = seatedStreet('sit');
    const hungry = contentNeeds(guests);
    hungry.level.hunger[0] = 0;
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    expect(doing(crowd, hungry, 0, TO_BAKERY)).toBe(
      `Hungry · Walking to the Bakery · tile ${tileX}, ${tileZ}`,
    );
  });

  it('is the line plan 016 wrote, to the byte, for anybody with nowhere to be', () => {
    const crowd = seatedStreet('sit');
    const hungry = contentNeeds(guests);
    hungry.level.hunger[0] = 0;
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    expect(doing(crowd, hungry, 0, null)).toBe(`Hungry · Walking · tile ${tileX}, ${tileZ}`);
    // And a guest who is sitting is sitting, whatever they may be heading for.
    const sitting = seatedStreet('sit');
    const sitter = until(sitting, (i) => restingOn(sitting, i) === RESTING.sitting);
    expect(doing(sitting, content, sitter, TO_BAKERY).split(' · ')[0]).toBe('Sitting');
  });

  it('tells sitting, lying down and being on the beach apart', () => {
    const sitting = seatedStreet('sit');
    const sitter = until(sitting, (i) => restingOn(sitting, i) === RESTING.sitting);
    const lying = seatedStreet('lie');
    const lier = until(lying, (i) => restingOn(lying, i) === RESTING.lying);

    // A boardwalk down to six rows of sand, which somebody wanders off onto.
    const shore = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
    });
    const paved: PavedTile[] = Array.from({ length: 8 }, (_, index) => ({
      tileX: 10,
      tileZ: 10 + index,
      y: 0,
    }));
    const beach = createCrowd({
      network: walkNetworkFor({ paved, levelOf: () => 0, shore, tilesX: 20 }),
      count: 40,
      variants: 2,
      seed: 21,
    });
    const roamer = until(beach, (i) => isRoaming(beach, i));

    const lines = [
      doing(seatedStreet('sit'), content, 0),
      doing(sitting, content, sitter),
      doing(lying, content, lier),
      doing(beach, content, roamer),
    ].map((line) => line.split(' · ')[0]);
    expect(lines).toEqual(['Walking', 'Sitting', 'Lying down', 'On the beach']);
  });
});

describe('a guest the simulation is holding still', () => {
  const guests = guestsOf();
  const content = contentNeeds(guests);
  const doing = (crowd: Crowd, needs: Needs, person: number, errand: Errand): string =>
    activityLine(crowd, needs, guests, person, errand);

  it('says which place in the line they are standing in, and drops the tile', () => {
    const crowd = seatedStreet('sit');
    const hungry = contentNeeds(guests);
    hungry.level.hunger[0] = 0;
    expect(doing(crowd, hungry, 0, { kind: 'waiting', at: 'Bakery', place: 2 })).toBe(
      'Hungry · Third in the line at the Bakery',
    );
  });

  it('says they are inside, and drops the tile there too', () => {
    const crowd = seatedStreet('sit');
    expect(doing(crowd, content, 0, { kind: 'inside', at: 'Bakery' })).toBe('Inside the Bakery');
  });

  it('says what they are doing rather than that they are sitting', () => {
    // Somebody held inside a bakery is not walking and is not on a bench; the
    // errand is what they are up to, whatever the crowd's own pose says.
    const sitting = seatedStreet('sit');
    const sitter = until(sitting, (i) => restingOn(sitting, i) === RESTING.sitting);
    expect(doing(sitting, content, sitter, { kind: 'inside', at: 'Bakery' })).toBe(
      'Inside the Bakery',
    );
  });
});

describe('placeWording', () => {
  it('words the first few places and numbers the rest', () => {
    expect([0, 1, 2, 3].map(placeWording)).toEqual(['First', 'Second', 'Third', 'Fourth']);
    expect(placeWording(4)).toBe('5th');
    expect(placeWording(11)).toBe('12th');
  });
});

describe('placeView with a venue that is being used', () => {
  it('reports who is inside and who is in the line', () => {
    const view = placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guestsOf(), {
      inside: 12,
      waiting: 3,
    });
    expect(view.venue?.inside).toBe(12);
    expect(view.venue?.waiting).toBe(3);
  });

  it('reports a venue nothing has counted yet as empty rather than as unknown', () => {
    const view = placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guestsOf(), null);
    expect(view.venue?.inside).toBe(0);
    expect(view.venue?.waiting).toBe(0);
  });
});
