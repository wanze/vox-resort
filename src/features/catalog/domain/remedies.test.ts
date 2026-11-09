import { describe, expect, it } from 'vitest';
import { createPrestige } from '../../sim/domain/prestige';
import { ORIGINAL_TYPES } from './objectTypes';
import { buildCostOf } from './prices';
import { remediesFor } from './remedies';

const labelOf = (id: string): string => ORIGINAL_TYPES.find((type) => type.id === id)!.label;

describe('remediesFor', () => {
  it('names the cheapest unlocked venues that serve a need, cheapest first', () => {
    const named = remediesFor('energy', createPrestige(), 'tycoon');
    expect(named).toHaveLength(2);
    const costs = named.map((label) =>
      buildCostOf(ORIGINAL_TYPES.find((type) => type.label === label)!.id),
    );
    expect(costs).toEqual(costs.toSorted((a, b) => a - b));
  });

  it('leaves out what the stars have not unlocked yet', () => {
    expect(remediesFor('energy', createPrestige(), 'tycoon')).not.toContain(
      labelOf('massage-tent'),
    );
    expect(remediesFor('energy', null, 'sandbox')).toContain(labelOf('massage-tent'));
  });
});
