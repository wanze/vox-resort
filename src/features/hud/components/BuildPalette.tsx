import { useMemo, useState } from 'react';
import { objectTypeGroups } from '../../catalog/domain/objectTypes';
import { BuildGroup } from './BuildGroup';

export interface BuildPaletteProps {
  /** Type the pointer is armed with, or null when nothing is being placed. */
  readonly selected: string | null;
  readonly onSelect: (typeId: string | null) => void;
}

/**
 * The build palette: the shelves the catalogue declares, one open at a time.
 *
 * Nothing here is a list of objects — the groups come straight from the model
 * registry, so a new model file appears in the palette without this component
 * being touched, which is the same rule the layout, the materials and the HUD
 * labels already follow.
 */
export function BuildPalette({ selected, onSelect }: BuildPaletteProps) {
  const groups = useMemo(() => objectTypeGroups(), []);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <section className="hud-palette" aria-label="Build palette">
      {groups.map((group) => (
        <BuildGroup
          key={group.category}
          group={group}
          open={openGroup === group.category}
          onToggle={() =>
            setOpenGroup((current) => (current === group.category ? null : group.category))
          }
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}
