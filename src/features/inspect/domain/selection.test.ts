import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import {
  createCrowd,
  holdAt,
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
import { createHappiness } from '../../sim/domain/happiness';
import { createNeeds, NEEDS, type Needs } from '../../sim/domain/needs';
import { venuesOn, type Venue } from '../../sim/domain/venues';
import {
  activityLine,
  errandOf,
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

const guestsOf = (count = 80): Guests =>
  createGuests({ count, homes: HOMES, variants: 4, childVariant: 3, seed: 5 });

const needsOf = (guests: Guests, level: number | null = null, person = 0): Needs => {
  const needs = createNeeds(guests, 7);
  if (level !== null) for (const need of NEEDS) needs.level[need][person] = level;
  return needs;
};

const HERE: GuestSpot = { x: 0, z: 0 };

const NO_VENUES: readonly Venue[] = [];

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

const moodOf = (guests: Guests) => createHappiness(guests.count);

describe('guestView', () => {
  it('names the guest and lists their whole party, themselves included, in party order', () => {
    const guests = guestsOf();
    const person = Array.from({ length: guests.count }, (_, i) => i).find(
      (i) => guests.parties[guests.party[i]!]!.members.length > 2,
    )!;
    const view = guestView(guests, needsOf(guests), moodOf(guests), NO_VENUES, person, 0, HERE);
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
    expect(guestView(guests, needs, moodOf(guests), NO_VENUES, homeless, 0, HERE).home).toBeNull();
    const housed = guests.home.findIndex((index) => index !== NO_HOME);
    const view = guestView(guests, needs, moodOf(guests), NO_VENUES, housed, 0, HERE);
    expect(view.home).toEqual({
      key: guests.homes[guests.home[housed]!]!.key,
      label: guests.homes[guests.home[housed]!]!.label,
    });
  });

  it('counts the nights left from the day it is, past zero once the stay is over', () => {
    const guests = guestsOf();
    const needs = needsOf(guests);
    const view = (day: number) => guestView(guests, needs, moodOf(guests), NO_VENUES, 0, day, HERE);
    const { arrivedOn, nights } = view(0);
    expect(view(0).nightsLeft).toBe(arrivedOn + nights);
    expect(view(4).nightsLeft).toBe(arrivedOn + nights - 4);
    expect(view(arrivedOn + nights + 2).nightsLeft).toBe(-2);
  });

  it('carries all five need levels, in the order the HUD lists them', () => {
    const guests = guestsOf();
    const needs = needsOf(guests);
    const view = guestView(guests, needs, moodOf(guests), NO_VENUES, 3, 0, HERE);
    expect(view.needs.map((entry) => entry.need)).toEqual([...NEEDS]);
    for (const entry of view.needs) {
      expect(entry.level).toBeCloseTo(needs.level[entry.need][3]!, 5);
    }
  });

  it('wants nothing from a guest who has everything', () => {
    const guests = guestsOf();
    const bakery = venuesOn([at('bakery#0', 'bakery')]);
    expect(
      guestView(guests, needsOf(guests, 1, 3), moodOf(guests), bakery, 3, 0, HERE).wants,
    ).toBeNull();
  });

  it('names the bakery for a hungry guest, and nowhere when none is standing', () => {
    const guests = guestsOf();
    const needs = needsOf(guests, 0, 3);
    const bakery = venuesOn([at('bakery#0', 'bakery')]);
    expect(guestView(guests, needs, moodOf(guests), bakery, 3, 0, HERE).wants).toEqual({
      need: 'hunger',
      label: 'Bakery',
    });
    expect(guestView(guests, needs, moodOf(guests), NO_VENUES, 3, 0, HERE).wants).toBeNull();
  });

  it('chooses from where the guest is standing, not from the corner of the plot', () => {
    const guests = guestsOf();
    const needs = needsOf(guests, 0, 3);
    const venues = venuesOn([
      at('bakery#0', 'bakery', 1, 1),
      at('restaurant#0', 'restaurant', 90, 1),
    ]);
    expect(
      guestView(guests, needs, moodOf(guests), venues, 3, 0, doorOf(venues[0]!)).wants?.label,
    ).toBe('Bakery');
    expect(
      guestView(guests, needs, moodOf(guests), venues, 3, 0, doorOf(venues[1]!)).wants?.label,
    ).toBe('Restaurant');
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
    const guests = guestsOf();
    expect(
      placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guests, null).venue?.dwell,
    ).toBe('30 to 60 min');
    expect(placeView(at('bungalow#0', 'bungalow'), 'Bungalow', guests, null).venue?.dwell).toBe(
      '7 to 9 h',
    );
  });
});

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

const until = (crowd: Crowd, matches: (i: number) => boolean): number => {
  for (let elapsed = 0; elapsed < 900; elapsed += 1 / 10) {
    stepCrowd(crowd, 1 / 10);
    for (let i = 0; i < crowd.count; i++) if (matches(i)) return i;
  }
  throw new Error('nobody ever did it');
};

const contentNeeds = (guests: Guests): Needs => {
  const needs = createNeeds(guests, 7);
  for (const need of NEEDS) needs.level[need].fill(1);
  return needs;
};

const beachCrowd = (): Crowd => {
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
  return createCrowd({
    network: walkNetworkFor({ paved, levelOf: () => 0, shore, tilesX: 20 }),
    count: 40,
    variants: 2,
    seed: 21,
  });
};

describe('activityLine', () => {
  const guests = guestsOf();
  const content = contentNeeds(guests);
  const doing = (crowd: Crowd, needs: Needs, person: number, errand: Errand = null): string =>
    activityLine(crowd, needs, guests, person, errand);

  const TO_BAKERY: Errand = { kind: 'walking', to: 'Bakery', home: false };

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
    const sitting = seatedStreet('sit');
    const sitter = until(sitting, (i) => restingOn(sitting, i) === RESTING.sitting);
    expect(doing(sitting, content, sitter, TO_BAKERY).split(' · ')[0]).toBe('Sitting');
  });

  it('tells sitting, lying down and being on the beach apart', () => {
    const sitting = seatedStreet('sit');
    const sitter = until(sitting, (i) => restingOn(sitting, i) === RESTING.sitting);
    const lying = seatedStreet('lie');
    const lier = until(lying, (i) => restingOn(lying, i) === RESTING.lying);

    const beach = beachCrowd();
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

  it('says what a guest on a visit to the beach is doing on it, not that they are inside it', () => {
    const beach = beachCrowd();
    const roamer = until(beach, (i) => isRoaming(beach, i));
    const line = doing(beach, content, roamer, { kind: 'inside', at: 'Beach' });
    expect(line.startsWith('On the beach · tile ')).toBe(true);
  });

  it('says they are inside, and drops the tile there too', () => {
    const crowd = seatedStreet('sit');
    expect(doing(crowd, content, 0, { kind: 'inside', at: 'Bakery' })).toBe('Inside the Bakery');
  });

  it('says what they are doing rather than that they are sitting', () => {
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

  it('reports how clean it is, and calls a place nobody keeps upkeep for spotless', () => {
    const grubby = placeView(
      at('restaurant#0', 'restaurant'),
      'Restaurant',
      guestsOf(),
      null,
      0.42,
    );
    expect(grubby.venue?.cleanliness).toBeCloseTo(0.42);
    const fresh = placeView(at('restaurant#0', 'restaurant'), 'Restaurant', guestsOf(), null);
    expect(fresh.venue?.cleanliness).toBe(1);
  });
});

describe('a guest at night', () => {
  const guests = guestsOf();
  const content = contentNeeds(guests);

  it('says they are asleep, with no mood and no tile', () => {
    const crowd = seatedStreet('sit');
    const tired = contentNeeds(guests);
    tired.level.energy[0] = 0;
    const line = activityLine(crowd, tired, guests, 0, { kind: 'asleep', at: 'Bungalow' });
    expect(line).toBe('Asleep at the Bungalow');
    expect(line).not.toContain('tile');
  });

  it('says a guest heading for bed is walking home, not merely walking there', () => {
    const crowd = seatedStreet('sit');
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    const bedward: Errand = { kind: 'walking', to: 'Bungalow', home: true };
    expect(activityLine(crowd, content, guests, 0, bedward)).toBe(
      `Walking home to the Bungalow · tile ${tileX}, ${tileZ}`,
    );
  });
});

describe('errandOf', () => {
  const BAKERY = { label: 'Bakery' };
  const BUNGALOW = { label: 'Bungalow' };
  const none = { visit: null, goal: null, home: null, asleep: false, beach: null };

  it('is nothing for a guest with nowhere to be', () => {
    expect(errandOf(none)).toBeNull();
  });

  it('words a walk to a venue, and a walk home ahead of it', () => {
    expect(errandOf({ ...none, goal: BAKERY })).toEqual({
      kind: 'walking',
      to: 'Bakery',
      home: false,
    });
    expect(errandOf({ ...none, goal: BAKERY, home: BUNGALOW })).toEqual({
      kind: 'walking',
      to: 'Bungalow',
      home: true,
    });
  });

  it('puts a visit ahead of a walk, and sleep ahead of everything', () => {
    const visit = { venue: BAKERY, waiting: true, place: 1 };
    expect(errandOf({ ...none, visit, goal: BAKERY })).toEqual({
      kind: 'waiting',
      at: 'Bakery',
      place: 1,
    });
    expect(errandOf({ ...none, visit: { ...visit, waiting: false } })).toEqual({
      kind: 'inside',
      at: 'Bakery',
    });
    expect(errandOf({ ...none, home: BUNGALOW, asleep: true })).toEqual({
      kind: 'asleep',
      at: 'Bungalow',
    });
  });

  it('words the walk to the desk and the line at it as checking in, but not a walk home', () => {
    const RECEPTION = { label: 'Reception' };
    const arriving = { ...none, checkingIn: true };
    expect(errandOf({ ...arriving, goal: RECEPTION })).toEqual({
      kind: 'checking-in',
      at: 'Reception',
    });
    const visit = { venue: RECEPTION, waiting: true, place: 2 };
    expect(errandOf({ ...arriving, visit, goal: RECEPTION })?.kind).toBe('checking-in');
    expect(errandOf({ ...arriving, goal: RECEPTION, home: BUNGALOW })?.kind).toBe('walking');
    expect(errandOf(arriving)).toBeNull();
  });

  it('puts a stay on the beach ahead of the visit to the Beach it is counted as', () => {
    const visit = { venue: { label: 'Beach' }, waiting: false, place: -1 };
    expect(errandOf({ ...none, visit, beach: 'resting' })).toEqual({
      kind: 'beach',
      stage: 'resting',
    });
    expect(errandOf({ ...none, beach: 'leaving', goal: BAKERY })).toEqual({
      kind: 'beach',
      stage: 'leaving',
    });
    expect(errandOf({ ...none, home: BUNGALOW, asleep: true, beach: 'arriving' })?.kind).toBe(
      'asleep',
    );
  });
});

describe('a guest staying on the beach', () => {
  const guests = guestsOf();
  const content = contentNeeds(guests);
  const SAND = { x: 6.5 * TILE_VOXELS, z: 14.5 * TILE_VOXELS };

  const lineFor = (pose: number, needs: Needs = content): string => {
    const crowd = beachCrowd();
    holdAt(crowd, 0, SAND.x, 0.3, SAND.z, 0, pose);
    return activityLine(crowd, needs, guests, 0, { kind: 'beach', stage: 'resting' });
  };

  it('says they are lying on the beach, with no tile', () => {
    expect(lineFor(RESTING.lying)).toBe('Lying on the beach');
  });

  it('says a child is sitting on the beach, with their mood in front', () => {
    const bored = contentNeeds(guests);
    bored.level.fun[0] = 0;
    expect(lineFor(RESTING.sitting, bored)).toBe('Bored · Sitting on the beach');
  });

  it('says they are walking to the beach, and where they have got to', () => {
    const crowd = seatedStreet('sit');
    const tileX = Math.floor(crowd.x[0]! / TILE_VOXELS);
    const tileZ = Math.floor(crowd.z[0]! / TILE_VOXELS);
    expect(activityLine(crowd, content, guests, 0, { kind: 'beach', stage: 'arriving' })).toBe(
      `Walking to the beach · tile ${tileX}, ${tileZ}`,
    );
  });

  it('says they are walking back from the beach, and where they have got to', () => {
    const crowd = seatedStreet('sit');
    const line = activityLine(crowd, content, guests, 0, { kind: 'beach', stage: 'leaving' });
    expect(line.startsWith('Walking back from the beach · tile ')).toBe(true);
  });
});
