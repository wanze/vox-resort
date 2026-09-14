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
import {
  activityLine,
  guestView,
  namesPlacement,
  personOf,
  placeView,
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
    const view = guestView(guests, person, 0);
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
    expect(guestView(guests, homeless, 0).home).toBeNull();
    const housed = guests.home.findIndex((index) => index !== NO_HOME);
    const view = guestView(guests, housed, 0);
    expect(view.home).toEqual({
      key: guests.homes[guests.home[housed]!]!.key,
      label: guests.homes[guests.home[housed]!]!.label,
    });
  });

  it('counts the nights left from the day it is, past zero once the stay is over', () => {
    const guests = guestsOf();
    const { arrivedOn, nights } = guestView(guests, 0, 0);
    expect(guestView(guests, 0, 0).nightsLeft).toBe(arrivedOn + nights);
    expect(guestView(guests, 0, 4).nightsLeft).toBe(arrivedOn + nights - 4);
    expect(guestView(guests, 0, arrivedOn + nights + 2).nightsLeft).toBe(-2);
  });
});

describe('placeView', () => {
  it('lists exactly the guests who sleep in a bungalow', () => {
    const guests = guestsOf();
    const view = placeView(at('bungalow#0', 'bungalow'), 'Bungalow', guests);
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
    const view = placeView(at('bench#2', 'bench'), 'Bench', guestsOf());
    expect(view.venue).toBeNull();
    expect(view.residents).toEqual([]);
  });

  it('says what a restaurant seats and serves, and houses nobody', () => {
    const view = placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guestsOf());
    expect(view.venue?.role).toBe('food');
    expect(view.venue?.capacity).toBe(40);
    expect(view.venue?.serves).toEqual(['Hunger', 'Thirst']);
    expect(view.residents).toEqual([]);
  });

  it('words a short visit in minutes and a night in hours', () => {
    // The restaurant's half hour to an hour, and the bungalow's seven to nine
    // hours: the two units a stay is thought of in.
    const guests = guestsOf();
    expect(placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guests).venue?.dwell).toBe(
      '30 to 60 min',
    );
    expect(placeView(at('bungalow#0', 'bungalow'), 'Bungalow', guests).venue?.dwell).toBe(
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

describe('activityLine', () => {
  it('says somebody on the paving is walking, and where', () => {
    const crowd = seatedStreet('sit');
    const line = activityLine(crowd, 0);
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    expect(line).toBe(`Walking · tile ${tileX}, ${tileZ}`);
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
      activityLine(seatedStreet('sit'), 0),
      activityLine(sitting, sitter),
      activityLine(lying, lier),
      activityLine(beach, roamer),
    ].map((line) => line.split(' · ')[0]);
    expect(lines).toEqual(['Walking', 'Sitting', 'Lying down', 'On the beach']);
  });
});
