import { BuildTile } from './BuildTile';
import type { PreviewLookup } from './BuildPalette';
import type { ObjectTypeGroup } from '../../catalog/domain/objectTypes';
import type { Ledger } from '../../sim/domain/ledger';
import type { Prestige } from '../../sim/domain/prestige';

export interface BuildGridProps {
  readonly group: ObjectTypeGroup;
  readonly preview: PreviewLookup;
  readonly selected: string | null;
  readonly ledger: Ledger | null;
  readonly prestige: Prestige | null;
  readonly onSelect: (typeId: string | null) => void;
}

export function BuildGrid({
  group,
  preview,
  selected,
  ledger,
  prestige,
  onSelect,
}: BuildGridProps) {
  return (
    <div className="hud-build-grid">
      {group.types.map((type) => (
        <BuildTile
          key={type.id}
          type={type}
          preview={preview}
          selected={selected === type.id}
          ledger={ledger}
          prestige={prestige}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// Search hits stay under their category, so the player still sees what kind of thing each one is.
export function BuildGroup(props: BuildGridProps) {
  return (
    <section>
      <h3 className="hud-build-group-head">
        <span className="ui-label">{props.group.label}</span>
        <span className="hud-build-group-count">{props.group.types.length}</span>
      </h3>
      <BuildGrid {...props} />
    </section>
  );
}
