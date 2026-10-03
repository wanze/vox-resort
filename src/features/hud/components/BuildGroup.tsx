import { BuildTile } from './BuildTile';
import type { PreviewLookup } from './BuildPalette';
import type { ObjectTypeGroup } from '../../catalog/domain/objectTypes';
import type { Ledger } from '../../sim/domain/ledger';

export interface BuildGridProps {
  readonly group: ObjectTypeGroup;
  readonly preview: PreviewLookup;
  readonly selected: string | null;
  readonly ledger: Ledger | null;
  readonly onSelect: (typeId: string | null) => void;
}

export function BuildGrid({ group, preview, selected, ledger, onSelect }: BuildGridProps) {
  return (
    <div className="build-grid">
      {group.types.map((type) => (
        <BuildTile
          key={type.id}
          type={type}
          preview={preview}
          selected={selected === type.id}
          ledger={ledger}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// Search hits stay under their category, so the player still sees what kind of thing each one is.
export function BuildGroup(props: BuildGridProps) {
  return (
    <section className="build-group">
      <h3 className="build-group-head">
        <span className="build-group-label">{props.group.label}</span>
        <span className="build-group-count">{props.group.types.length}</span>
      </h3>
      <BuildGrid {...props} />
    </section>
  );
}
