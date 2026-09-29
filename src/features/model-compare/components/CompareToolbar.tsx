import type { CompareView } from '../domain/comparison';

export interface CompareToolbarProps {
  readonly view: CompareView;
  readonly spin: boolean;
  readonly onView: (view: CompareView) => void;
  readonly onSpin: (spin: boolean) => void;
}

const VIEWS: readonly { readonly id: CompareView; readonly label: string; readonly key: string }[] =
  [
    { id: 'side', label: 'Side by side', key: '1' },
    { id: 'original', label: 'Current', key: '2' },
    { id: 'variant', label: 'New', key: '3' },
  ];

export function CompareToolbar({ view, spin, onView, onSpin }: CompareToolbarProps) {
  return (
    <div className="compare-toolbar" role="toolbar" aria-label="View">
      {VIEWS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === view}
          onClick={() => onView(option.id)}
        >
          {option.label} <kbd>{option.key}</kbd>
        </button>
      ))}
      <label className="compare-spin">
        <input type="checkbox" checked={spin} onChange={(event) => onSpin(event.target.checked)} />
        Turntable
      </label>
    </div>
  );
}
