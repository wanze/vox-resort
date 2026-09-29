import type { ComparisonEntry } from '../domain/comparison';

export interface ComparisonListProps {
  readonly entries: readonly ComparisonEntry[];
  readonly selected: string;
  readonly onSelect: (variantId: string) => void;
}

export function ComparisonList({ entries, selected, onSelect }: ComparisonListProps) {
  return (
    <nav className="compare-list" aria-label="Models">
      {entries.map((entry) => (
        <button
          key={entry.variantId}
          type="button"
          aria-pressed={entry.variantId === selected}
          onClick={() => onSelect(entry.variantId)}
        >
          <span>{entry.label}</span>
          <small>
            {entry.id} / {entry.variantId}
          </small>
        </button>
      ))}
    </nav>
  );
}
