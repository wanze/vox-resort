import { describe, expect, it } from 'vitest';
import {
  assignNames,
  MAX_VENUE_NAME,
  namedPlacesOf,
  renameTo,
  type NamedPlace,
} from './venueNames';
import type { Placement } from '../../layout/domain/resortLayout';
import { FIRSTS } from './resortName';

const SUGGESTIONS = ['The Salty Spoon', 'Trattoria Sole', 'Casa Marina'];

const place = (key: string, tileX = 0, tileZ = 0, suggestions = SUGGESTIONS): NamedPlace => ({
  key,
  tileX,
  tileZ,
  kind: 'Restaurant',
  suggestions,
});

describe('assignNames', () => {
  it('never changes a name already held', () => {
    const held = new Map([['restaurant', 'Bob’s Diner']]);
    const names = assignNames(held, [place('restaurant'), place('restaurant#2', 5)]);
    expect(names.get('restaurant')).toBe('Bob’s Diner');
    expect(names.get('restaurant#2')).toBeDefined();
  });

  it('draws a new place a name nobody holds, whatever its case', () => {
    for (const taken of SUGGESTIONS) {
      const held = new Map([['restaurant', taken.toUpperCase()]]);
      const names = assignNames(held, [place('restaurant'), place('restaurant#2', 3, 4)]);
      expect(names.get('restaurant#2')!.toLowerCase()).not.toBe(taken.toLowerCase());
    }
  });

  it('hashes the tile as well as the key, so two seeds can name the same key apart', () => {
    const drawn = new Set<string>();
    for (let tileX = 0; tileX < 12; tileX++) {
      drawn.add(assignNames(new Map(), [place('restaurant#2', tileX, 7)]).get('restaurant#2')!);
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it('falls back to a word and the kind, then to the kind and a number', () => {
    const one = ['The Salty Spoon'];
    const names = assignNames(new Map(), [place('a', 0, 0, one), place('b', 0, 0, one)]);
    expect([...names.values()].toSorted()).toEqual(['Coral Restaurant', 'The Salty Spoon']);
    const held = new Map<string, string>(
      FIRSTS.map((word, at) => [`held${at}`, `${word} Restaurant`]),
    );
    held.set('spoon', 'The Salty Spoon');
    held.set('two', 'Restaurant 2');
    const standing = [...held.keys()].map((key) => place(key)).concat(place('z', 0, 0, one));
    expect(assignNames(held, standing).get('z')).toBe('Restaurant 3');
  });

  it('leaves a place with no suggestions unnamed', () => {
    expect(assignNames(new Map(), [place('restrooms', 0, 0, [])]).has('restrooms')).toBe(false);
  });

  it('keeps a name the player gave a place with no suggestions', () => {
    const held = new Map([['restrooms', 'The Throne Room']]);
    expect(assignNames(held, [place('restrooms', 0, 0, [])]).get('restrooms')).toBe(
      'The Throne Room',
    );
  });

  it('drops the names of places no longer standing', () => {
    const held = new Map([['gone', 'Casa Marina']]);
    expect(assignNames(held, [place('restaurant')]).has('gone')).toBe(false);
  });

  it('draws the same names whatever order the places come in', () => {
    const standing = [place('c', 1, 2), place('a', 3, 4), place('b', 5, 6), place('d', 7, 8)];
    const forwards = assignNames(new Map(), standing);
    const backwards = assignNames(new Map(), standing.toReversed());
    expect(Object.fromEntries(backwards)).toEqual(Object.fromEntries(forwards));
  });
});

describe('renameTo', () => {
  it('keeps a typed name, cleaned, even one another venue holds', () => {
    const held = new Map([['other', 'Casa Marina']]);
    const renamed = renameTo(held, place('restaurant'), '  Casa   Marina ', Math.random);
    expect(renamed.get('restaurant')).toBe('Casa Marina');
    const long = renameTo(held, place('restaurant'), 'x'.repeat(40), Math.random);
    expect(long.get('restaurant')).toHaveLength(MAX_VENUE_NAME);
  });

  it('draws a different free name for an emptied one', () => {
    const held = new Map([
      ['restaurant', 'The Salty Spoon'],
      ['other', 'Casa Marina'],
    ]);
    expect(renameTo(held, place('restaurant'), ' \t ', () => 0).get('restaurant')).toBe(
      'Trattoria Sole',
    );
  });

  it('falls back once every suggestion is held or current', () => {
    const held = new Map([['restaurant', 'The Salty Spoon']]);
    const one = place('restaurant', 0, 0, ['The Salty Spoon']);
    expect(renameTo(held, one, '', Math.random).get('restaurant')).toBe('Coral Restaurant');
  });

  it('clears a place with no suggestions back to its kind', () => {
    const held = new Map([['restrooms', 'The Throne Room']]);
    expect(renameTo(held, place('restrooms', 0, 0, []), '', Math.random).has('restrooms')).toBe(
      false,
    );
  });
});

const placed = (key: string, id: string) =>
  ({ key, id, tileX: 3, tileZ: 4 }) as unknown as Placement;

describe('namedPlacesOf', () => {
  it('lists the venues with their kind and suggestions, and leaves lodgings and dressing out', () => {
    const listed = namedPlacesOf([
      placed('restaurant#2', 'restaurant'),
      placed('restrooms', 'restrooms'),
      placed('hotel', 'hotel'),
      placed('bench', 'bench'),
    ]);
    expect(listed.map((each) => each.key)).toEqual(['restaurant#2', 'restrooms']);
    expect(listed[0]).toMatchObject({ kind: 'Restaurant', tileX: 3, tileZ: 4 });
    expect(listed[0]!.suggestions.length).toBeGreaterThan(0);
    expect(listed[1]!.suggestions).toEqual([]);
  });
});
