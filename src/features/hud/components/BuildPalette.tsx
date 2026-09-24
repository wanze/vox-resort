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

// Injected rather than imported: the pictures come from the bundler, and components may not import
// adapters.
export type PreviewLookup = (modelId: string) => string | null;

function armedLabel(tool: BuildTool | null): string | null {
  if (armedRemove(tool)) return BULLDOZER.label;
  const id = armedObject(tool);
  if (id) return objectTypeById(id).label;
  return brushLabel(armedBrush(tool));
}

function brushLabel(brush: TerrainBrush | null): string | null {
  return TERRAIN_BRUSHES.find((entry) => entry.id === brush)?.label ?? null;
}

export interface BuildPaletteProps {
  readonly preview: PreviewLookup;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
}

// A search opens every shelf: a hit inside a folded one would read as no hit.
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
