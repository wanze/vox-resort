import { useMemo, useState } from 'react';
import { BuildGroup } from './BuildGroup';
import { BuildPaletteHead } from './BuildPaletteHead';
import { TerrainShelf } from './TerrainShelf';
import { ToolShelf } from './ToolShelf';
import { objectTypeById, objectTypeGroups } from '../../catalog/domain/objectTypes';
import {
  armedBrush,
  armedObject,
  armedRemove,
  BULLDOZER,
  type BuildTool,
} from '../../build/domain/buildTool';
import { TERRAIN_BRUSHES, type TerrainBrush } from '../../build/domain/terrainBrush';
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

/**
 * What the head prints as the thing you are holding, or null when nothing is.
 *
 * A function rather than an expression in the body because its answers come from
 * three places — the catalogue names an object, `TERRAIN_BRUSHES` names a brush
 * and `BULLDOZER` names itself — and none knows about the others.
 */
function armedLabel(tool: BuildTool | null): string | null {
  if (armedRemove(tool)) return BULLDOZER.label;
  const id = armedObject(tool);
  if (id) return objectTypeById(id).label;
  return brushLabel(armedBrush(tool));
}

/** What `TERRAIN_BRUSHES` calls a brush, or null for none. */
function brushLabel(brush: TerrainBrush | null): string | null {
  return TERRAIN_BRUSHES.find((entry) => entry.id === brush)?.label ?? null;
}

export interface BuildPaletteProps {
  readonly preview: PreviewLookup;
  /** What the pointer is holding, or null when it is empty. */
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
}

/**
 * The build palette: the ground, then the shelves the catalogue declares,
 * stacked and searchable.
 *
 * Nothing here is a list of objects — the groups come straight from the model
 * registry, so a new model file appears in the palette without this component
 * being touched, which is the same rule the layout, the materials and the HUD
 * labels already follow. The terrain brushes come from their own rule for the
 * same reason.
 *
 * **The ground comes first**, above the objects, because it is what you build on:
 * a terrain edit needs a clear tile, so shaping the plot is a thing you do before
 * standing anything on it and not after. The bulldozer sits with it, because it
 * too works the plot rather than adding to it. Those two are the shelves a search
 * leaves alone — the search box narrows *the catalogue*, and a query that hid the
 * spade or the bulldozer would be answering a question nobody asked.
 *
 * Folding is tracked as the shelves that are *shut* rather than the one that is
 * open: the palette is five shelves of pictures and the useful default is to see
 * all of them, so the state starts empty and stays empty for anyone who never
 * folds anything. A search overrides it entirely — a hit hidden inside a folded
 * shelf would read as no hit at all.
 */
export function BuildPalette({ preview, tool, onToolChange }: BuildPaletteProps) {
  const groups = useMemo(() => objectTypeGroups(), []);
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');

  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  const searching = query.trim().length > 0;
  const objectId = armedObject(tool);
  const brush = armedBrush(tool);

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
        armed={armedLabel(tool)}
        onDisarm={() => onToolChange(null)}
      />

      <div className="hud-palette-shelves">
        <TerrainShelf
          open={!shut.has('terrain')}
          onToggle={toggle('terrain')}
          selected={brush}
          onSelect={(next) => onToolChange(next === null ? null : { kind: 'terrain', brush: next })}
        />

        <ToolShelf
          open={!shut.has('tools')}
          onToggle={toggle('tools')}
          armed={armedRemove(tool)}
          onArm={(armed) => onToolChange(armed ? { kind: 'remove' } : null)}
        />

        {shown.map((group) => (
          <BuildGroup
            key={group.category}
            group={group}
            preview={preview}
            open={searching || !shut.has(group.category)}
            onToggle={toggle(group.category)}
            selected={objectId}
            onSelect={(next) => onToolChange(next === null ? null : { kind: 'object', id: next })}
          />
        ))}
        {shown.length === 0 ? (
          <p className="hud-palette-empty">Nothing in the catalogue answers to that.</p>
        ) : null}
      </div>
    </section>
  );
}
