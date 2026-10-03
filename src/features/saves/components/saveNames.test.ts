import { describe, expect, it } from 'vitest';
import type { SaveMeta } from '../domain/snapshot';
import { summaryOf } from './saveNames';

const META: SaveMeta = {
  id: 'a',
  name: 'Summer',
  savedAt: 0,
  version: 1,
  mode: 'sandbox',
  day: 12,
  balance: 0,
  stars: 3,
  guests: 0,
  tilesX: 8,
  tilesZ: 8,
};

describe('summaryOf', () => {
  it('leads with the resort name, unless the save is called after it', () => {
    expect(summaryOf({ ...META, resortName: 'Coral Cove' }, 0)).toBe(
      'Coral Cove · Free play · day 12 · just now',
    );
    expect(summaryOf({ ...META, name: 'Coral Cove', resortName: 'Coral Cove' }, 0)).toBe(
      'Free play · day 12 · just now',
    );
    expect(summaryOf(META, 0)).toBe('Free play · day 12 · just now');
  });
});
