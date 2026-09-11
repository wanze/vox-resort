import { useMemo, useState } from 'react';
import { BuildGroup } from './BuildGroup';
import { BuildPaletteHead } from './BuildPaletteHead';
import { objectTypeById, objectTypeGroups } from '../../catalog/domain/objectTypes';
import { countTypes, filterGroups } from '../domain/paletteFilter';

/**
 * Where a tile's picture comes from: a model id in, a URL or null out.
 *
 * A function the palette is handed rather than a module it imports, because the
 * pictures are emitted by the bundler and a component may not reach into
 * `adapters/`. `App` owns the wiring, which is the same way the renderer, the
 * clock and the camera already reach the HUD.
 */
export type PreviewLookup = (modelId: string) => string | null;

export interface BuildPaletteProps {
  readonly preview: PreviewLookup;
  /** Type the pointer is armed with, or null when nothing is being placed. */
  readonly selected: string | null;
  readonly onSelect: (typeId: string | null) => void;
}

/**
 * The build palette: the shelves the catalogue declares, stacked and searchable.
 *
 * Nothing here is a list of objects — the groups come straight from the model
 * registry, so a new model file appears in the palette without this component
 * being touched, which is the same rule the layout, the materials and the HUD
 * labels already follow.
 *
 * Folding is tracked as the shelves that are *shut* rather than the one that is
 * open: the catalogue is four shelves of pictures and the useful default is to
 * see all of them, so the state starts empty and stays empty for anyone who
 * never folds anything. A search overrides it entirely — a hit hidden inside a
 * folded shelf would read as no hit at all.
 */
export function BuildPalette({ preview, selected, onSelect }: BuildPaletteProps) {
  const groups = useMemo(() => objectTypeGroups(), []);
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');

  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  const searching = query.trim().length > 0;
  const armed = selected ? objectTypeById(selected).label : null;

  const toggle = (category: string) => (): void =>
    setShut((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });

  return (
    <section className="hud-palette" aria-label="Build palette">
      <BuildPaletteHead
        count={countTypes(shown)}
        query={query}
        onQueryChange={setQuery}
        armed={armed}
        onDisarm={() => onSelect(null)}
      />

      <div className="hud-palette-shelves">
        {shown.map((group) => (
          <BuildGroup
            key={group.category}
            group={group}
            preview={preview}
            open={searching || !shut.has(group.category)}
            onToggle={toggle(group.category)}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
        {shown.length === 0 ? (
          <p className="hud-palette-empty">Nothing in the catalogue answers to that.</p>
        ) : null}
      </div>
    </section>
  );
}
