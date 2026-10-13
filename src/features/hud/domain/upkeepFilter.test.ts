import { describe, expect, it } from 'vitest';
import type { UpkeepRow } from '../../resort-sim/domain/ageing';
import { filterUpkeep, keptFilter, renovationBatchOf, upkeepChoices } from './upkeepFilter';

const row = (key: string, family: string, kind: string, lodging: boolean): UpkeepRow => ({
  key,
  id: family,
  sign: null,
  family,
  kind,
  label: kind,
  lodging,
  at: { tileX: 0, tileZ: 0 },
  level: 0.5,
  cost: 100,
  works: null,
  staying: 0,
});

const ROWS = [
  row('bungalow#1', 'bungalow', 'Bungalow', true),
  row('bar#2', 'resort-bar', 'Resort Bar', false),
  row('bungalow#3', 'bungalow', 'Bungalow', true),
  row('cafe#4', 'coffee-shop', 'Coffee Shop', false),
];

describe('upkeepChoices', () => {
  it('offers the roles first, then each kind standing once, by name', () => {
    expect(upkeepChoices(ROWS).map((choice) => choice.label)).toEqual([
      'All lodgings',
      'All venues',
      'Bungalow',
      'Coffee Shop',
      'Resort Bar',
    ]);
  });

  it('leaves out a role nothing stands in', () => {
    expect(upkeepChoices(ROWS.filter((each) => each.lodging)).map((choice) => choice.id)).toEqual([
      'lodgings',
      'bungalow',
    ]);
  });
});

describe('filterUpkeep', () => {
  it('keeps a role or a kind, in the order given, and everything for no filter', () => {
    expect(filterUpkeep(ROWS, 'lodgings').map((each) => each.key)).toEqual([
      'bungalow#1',
      'bungalow#3',
    ]);
    expect(filterUpkeep(ROWS, 'venues').map((each) => each.key)).toEqual(['bar#2', 'cafe#4']);
    expect(filterUpkeep(ROWS, 'coffee-shop').map((each) => each.key)).toEqual(['cafe#4']);
    expect(filterUpkeep(ROWS, null)).toBe(ROWS);
  });

  it('drops a kind no longer standing', () => {
    const choices = upkeepChoices(ROWS);
    expect(keptFilter('coffee-shop', choices)).toBe('coffee-shop');
    expect(keptFilter('minigolf', choices)).toBeNull();
  });
});

describe('renovationBatchOf', () => {
  it('sums what is worth renovating and leaves out what is new or under way', () => {
    const rows: UpkeepRow[] = [
      { ...ROWS[0]!, cost: 120 },
      { ...ROWS[1]!, cost: null },
      { ...ROWS[2]!, works: { kind: 'closing', staying: 2 } },
      { ...ROWS[3]!, cost: 80 },
    ];
    expect(renovationBatchOf(rows)).toEqual({ keys: ['bungalow#1', 'cafe#4'], cost: 200 });
  });

  it('is empty when nothing is due', () => {
    expect(renovationBatchOf([])).toEqual({ keys: [], cost: 0 });
  });
});
