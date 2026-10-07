import { describe, expect, it } from 'vitest';
import type { ModelVenue, VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import type { ObjectTypeDefinition } from '../../catalog/domain/objectTypes';
import { objectFacts, type ObjectFacts } from './objectFacts';

const MODEL = {
  tiles: { x: 2, z: 3 },
  gateway: false,
  depot: null,
  scenery: 0,
  shade: false,
  binReach: 0,
  lights: [],
  seats: [],
  placement: {},
  venue: null,
  hire: null,
} as unknown as VoxelModel;

function typeOf(model: Partial<VoxelModel>, category = 'amenities'): ObjectTypeDefinition {
  const venue = model.venue ?? null;
  return {
    id: 'thing',
    label: 'Thing',
    category,
    model: { ...MODEL, ...model, venue },
    venue,
  } as ObjectTypeDefinition;
}

const venue = (fields: Partial<ModelVenue>): ModelVenue => ({
  role: 'food',
  capacity: 20,
  dwellSeconds: { min: 480, max: 1200 },
  ...fields,
});

const valueOf = (facts: ObjectFacts, label: string): string | undefined =>
  facts.facts.find((each) => each.label === label)?.value;

describe('objectFacts', () => {
  it('always opens with what it costs and covers', () => {
    const facts = objectFacts(typeOf({}), 1200);
    expect(facts.facts.slice(0, 2)).toEqual([
      { label: 'Cost', value: '1,200' },
      { label: 'Size', value: '2×3 tiles' },
    ]);
  });

  it('says how many a lodging sleeps and what a night costs', () => {
    const facts = objectFacts(
      typeOf({ venue: venue({ role: 'lodging', beds: 6, price: 22 }) }, 'lodging'),
      900,
    );
    expect(valueOf(facts, 'Sleeps')).toBe('6 guests');
    expect(valueOf(facts, 'Price')).toBe('22 per guest a night');
    expect(valueOf(facts, 'Serves')).toBeUndefined();
    expect(facts.notes).toEqual(['Up to 25% more in pleasant surroundings']);
  });

  it('says what a venue serves, to how many, for how long and at what price', () => {
    const satisfies = [
      { need: 'hunger', amount: 0.8 },
      { need: 'thirst', amount: 0.8 },
    ] as const;
    const facts = objectFacts(typeOf({ venue: venue({ satisfies, price: 4 }) }), 500);
    expect(valueOf(facts, 'Serves')).toBe('Hunger, Thirst');
    expect(valueOf(facts, 'Guests at once')).toBe('20');
    expect(valueOf(facts, 'Typical stay')).toBe('8 to 20 min');
    expect(valueOf(facts, 'Price')).toBe('4 a visit');
    expect(valueOf(facts, 'Open')).toBeUndefined();
  });

  it('calls a venue without a price free and words hours past midnight', () => {
    const facts = objectFacts(
      typeOf({ venue: venue({ role: 'activity', hours: { opens: 1200, closes: 120 } }) }),
      0,
    );
    expect(valueOf(facts, 'Price')).toBe('Free');
    expect(valueOf(facts, 'Open')).toBe('20:00 to 02:00');
  });

  it('warns about what a venue asks of the weather and the staff', () => {
    const facts = objectFacts(
      typeOf({ venue: venue({ shelter: 'open', bathing: true, reliability: 60 }) }),
      0,
    );
    expect(facts.notes).toEqual([
      'Open-air: closes in rain and storms',
      'Guests swim here, so a lifeguard should watch',
      'Breaks down now and then; a mechanic repairs it',
    ]);
  });

  it('names the ground a beach object needs', () => {
    const facts = objectFacts(typeOf({ placement: { ground: 'shore' } }), 0);
    expect(valueOf(facts, 'Ground')).toBe('At the water’s edge');
  });

  it('grades scenery and counts only the seats a guest may take', () => {
    const seats = [{}, {}, { post: 'lifeguard' }] as unknown as VoxelModel['seats'];
    const facts = objectFacts(typeOf({ scenery: 0.8, seats }, 'grounds'), 0);
    expect(valueOf(facts, 'Scenery')).toBe('Strong');
    expect(valueOf(facts, 'Seats')).toBe('2');
    expect(facts.notes).toEqual([
      'Makes the tiles around it more pleasant',
      'A lifeguard watches from here',
    ]);
  });

  it('leaves the seats of a venue to its capacity', () => {
    const seats = [{}, {}] as unknown as VoxelModel['seats'];
    expect(valueOf(objectFacts(typeOf({ seats, venue: venue({}) }), 0), 'Seats')).toBeUndefined();
  });

  it('says a lamp lights the night but not that a lit venue does', () => {
    const lights = [{}] as unknown as VoxelModel['lights'];
    expect(objectFacts(typeOf({ lights }), 0).notes).toEqual(['Lights up at night']);
    expect(objectFacts(typeOf({ lights, venue: venue({}) }), 0).notes).toEqual([]);
  });

  it('gives a bin its reach', () => {
    const facts = objectFacts(typeOf({ binReach: 3 }), 0);
    expect(valueOf(facts, 'Reach')).toBe('3 tiles');
    expect(facts.notes).toEqual(['Guests carrying litter walk over to it']);
  });
});
