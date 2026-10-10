import { describe, expect, it } from 'vitest';
import type { Advice } from '../../sim/domain/advice';
import { adviceTiers, tierOf } from './adviceTiers';

const advice = (kind: Advice['kind'], subject: string, weight = 1): Advice => ({
  kind,
  weight,
  subject,
  count: 1,
  at: null,
  need: null,
});

describe('adviceTiers', () => {
  it('groups urgent before warning before note, and drops an empty tier', () => {
    const groups = adviceTiers([
      advice('unvisited', 'Bar'),
      advice('dirty', 'Spa'),
      advice('broken', 'Pool'),
      advice('no-events', 'programme'),
    ]);
    expect(groups.map((group) => group.tier)).toEqual(['urgent', 'warning', 'note']);
    expect(groups[2]!.advice.map((each) => each.subject)).toEqual(['Bar', 'programme']);
  });

  it('leaves out every tier for no advice', () => {
    expect(adviceTiers([])).toEqual([]);
  });

  it('notes advice too light to reach its severity', () => {
    expect(tierOf(advice('dirty', 'Spa', 0.1))).toBe('note');
  });
});
