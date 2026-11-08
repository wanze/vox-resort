import { describe, expect, it } from 'vitest';
import {
  isBuildable,
  offeringOf,
  requirementNoun,
  unmetOn,
  type Requirement,
} from './requirements';

const playground = {
  role: 'activity' as const,
  satisfies: [{ need: 'fun' as const, amount: 1 }],
  stage: true,
};
const villa = { role: 'lodging' as const, price: 120 };
const bungalow = { role: 'lodging' as const, price: 40 };

describe('offeringOf', () => {
  it('reads needs and flags off venues and prices off lodgings', () => {
    const offering = offeringOf([playground, villa, bungalow]);
    expect([...offering.needs]).toEqual(['fun']);
    expect([...offering.flags]).toEqual(['stage']);
    expect(offering.lodgingPrices).toEqual([120, 40]);
  });
});

describe('unmetOn', () => {
  const asked: Requirement[] = [
    { kind: 'need', value: 'fun' },
    { kind: 'flag', value: 'dj' },
    { kind: 'stars', value: 4 },
    { kind: 'lodging', value: 100 },
  ];

  it('lists what the resort lacks right now', () => {
    const facts = { ...offeringOf([playground, bungalow]), stars: 4.2 };
    expect(unmetOn(asked, facts)).toEqual([
      { kind: 'flag', value: 'dj' },
      { kind: 'lodging', value: 100 },
    ]);
  });

  it('is empty once everything stands and the stars hold', () => {
    const dj = { role: 'drink' as const, dj: true };
    const facts = { ...offeringOf([playground, villa, dj]), stars: 4 };
    expect(unmetOn(asked, facts)).toEqual([]);
  });
});

describe('requirementNoun', () => {
  it('words each kind of requirement as a noun phrase', () => {
    expect(requirementNoun({ kind: 'flag', value: 'stage' })).toBe('a stage');
    expect(requirementNoun({ kind: 'need', value: 'fun' })).toBe('something for the children');
    expect(requirementNoun({ kind: 'stars', value: 4 })).toBe('a 4★ resort');
    expect(requirementNoun({ kind: 'lodging', value: 120 })).toBe('rooms at 120 a night');
  });
});

describe('isBuildable', () => {
  it('asks the catalogue, never the stars', () => {
    const catalogue = offeringOf([playground]);
    expect(isBuildable({ kind: 'need', value: 'fun' }, catalogue)).toBe(true);
    expect(isBuildable({ kind: 'flag', value: 'dj' }, catalogue)).toBe(false);
    expect(isBuildable({ kind: 'stars', value: 5 }, catalogue)).toBe(true);
    expect(isBuildable({ kind: 'lodging', value: 50 }, catalogue)).toBe(false);
  });
});
