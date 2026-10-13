import type { UpkeepRow } from '../../resort-sim/domain/ageing';

// A family's own id, or one of the two roles, which no family is named.
export type UpkeepFilter = 'lodgings' | 'venues' | (string & {}) | null;

export interface UpkeepChoice {
  readonly id: string;
  readonly label: string;
}

const inRole = (row: UpkeepRow, filter: string): boolean =>
  filter === 'lodgings' ? row.lodging : filter === 'venues' ? !row.lodging : row.family === filter;

export const filterUpkeep = (
  rows: readonly UpkeepRow[],
  filter: UpkeepFilter,
): readonly UpkeepRow[] => (filter === null ? rows : rows.filter((row) => inRole(row, filter)));

// Only what stands, so no choice leaves the list empty; the roles first, then each kind.
export function upkeepChoices(rows: readonly UpkeepRow[]): readonly UpkeepChoice[] {
  const kinds = new Map(rows.map((row) => [row.family, row]));
  const roles = [
    rows.some((row) => row.lodging) ? { id: 'lodgings', label: 'All lodgings' } : null,
    rows.some((row) => !row.lodging) ? { id: 'venues', label: 'All venues' } : null,
  ].filter((choice): choice is UpkeepChoice => choice !== null);
  const families = [...kinds.values()]
    .map((row) => ({ id: row.family, label: row.kind }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
  return [...roles, ...families];
}

export interface RenovationBatch {
  readonly keys: readonly string[];
  readonly cost: number;
}

// Worn enough to be worth it and not under way already, in the list's order, worst first.
export function renovationBatchOf(rows: readonly UpkeepRow[]): RenovationBatch {
  const due = rows.flatMap((row) =>
    row.works === null && row.cost !== null ? [{ key: row.key, cost: row.cost }] : [],
  );
  return { keys: due.map((each) => each.key), cost: due.reduce((sum, each) => sum + each.cost, 0) };
}

// A kind pulled down since it was picked reads as no filter at all.
export const keptFilter = (filter: UpkeepFilter, choices: readonly UpkeepChoice[]): UpkeepFilter =>
  choices.some((choice) => choice.id === filter) ? filter : null;
