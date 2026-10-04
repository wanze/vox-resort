import { describe, expect, it } from 'vitest';
import type { Venue } from '../../sim/domain/venues';
import { EVENT_KINDS, type EventKind } from './catalogue';
import { siteVenueOf, sitesOf } from './sites';

const venue = (key: string, label: string, stage: boolean): Venue => ({
  key,
  id: key.split('#')[0]!,
  label,
  role: 'activity',
  satisfies: [{ need: 'fun', amount: 0.5 }],
  capacity: 20,
  dwellSeconds: { min: 60, max: 120 },
  stage,
  x: 0,
  z: 0,
  tileX: 0,
  tileZ: 0,
  tilesX: 2,
  tilesZ: 2,
  doors: [],
});

const VENUES = [
  venue('cafe#0', 'Café', false),
  venue('kids-club#0', 'Kids club', true),
  venue('beach-club#0', 'Coral Stage', true),
];

const ON_SAND: EventKind = { ...EVENT_KINDS.cinema, sites: ['beach'] };

describe('siteVenueOf', () => {
  it('finds a renamed stage by its key', () => {
    const renamed = VENUES.map((each) =>
      each.key === 'kids-club#0' ? { ...each, label: 'Fun Barn' } : each,
    );
    expect(siteVenueOf({ kind: 'stage', venue: 'kids-club#0' }, renamed)).toBe(1);
  });

  it('does not take a venue with the key that is no stage', () => {
    expect(siteVenueOf({ kind: 'stage', venue: 'cafe#0' }, VENUES)).toBe(-1);
    expect(siteVenueOf({ kind: 'stage', venue: 'gone#3' }, VENUES)).toBe(-1);
  });

  it('has no venue for the beach yet', () => {
    expect(siteVenueOf({ kind: 'beach' }, VENUES)).toBe(-1);
  });
});

describe('sitesOf', () => {
  it('lists the stages by name, and the beach only when a kind is played there', () => {
    const stages = [
      { kind: 'stage', venue: 'beach-club#0' },
      { kind: 'stage', venue: 'kids-club#0' },
    ];
    expect(sitesOf(VENUES, Object.values(EVENT_KINDS), true)).toEqual(stages);
    expect(sitesOf(VENUES, [ON_SAND], false)).toEqual(stages);
    expect(sitesOf(VENUES, [ON_SAND], true)).toEqual([...stages, { kind: 'beach' }]);
  });
});
