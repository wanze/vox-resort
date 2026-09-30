import { useMemo, useState } from 'react';
import { BuildGroup } from './BuildGroup';
import { BuildPaletteHead } from './BuildPaletteHead';
import { TerrainShelf } from './TerrainShelf';
import { ToolShelf } from './ToolShelf';
import { ZoneShelf, zoneLabel } from './ZoneShelf';
import { objectTypeById, objectTypeGroups } from '../../catalog/domain/objectTypes';
import {
  armedBrush,
  armedObject,
  armedRemove,
  armedZone,
  BULLDOZER,
  type BuildTool,
} from '../../build/domain/buildTool';
import { styleStripFor } from '../../build/domain/stylePick';
import { TERRAIN_BRUSHES, type TerrainBrush } from '../../build/domain/terrainBrush';
import { countTypes, filterGroups } from '../domain/paletteFilter';
import type { Ledger } from '../../sim/domain/ledger';
import type { Roster } from '../../sim/domain/staff';

// Injected rather than imported: the pictures come from the bundler, and components may not import
// adapters.
export type PreviewLookup = (modelId: string) => string | null;

function armedLabel(tool: BuildTool | null): string | null {
  if (armedRemove(tool)) return BULLDOZER.label;
  const id = armedObject(tool);
  if (id) return objectTypeById(id).label;
  const zone = armedZone(tool);
  if (zone !== null) return zoneLabel(zone);
  return brushLabel(armedBrush(tool));
}

function brushLabel(brush: TerrainBrush | null): string | null {
  return TERRAIN_BRUSHES.find((entry) => entry.id === brush)?.label ?? null;
}

export interface BuildPaletteProps {
  readonly preview: PreviewLookup;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly ledger: Ledger | null;
  readonly focusSearch: boolean;
  readonly zoneStaff: readonly Roster[] | null;
}

// A search opens every shelf: a hit inside a folded one would read as no hit.
export function BuildPalette({
  preview,
  tool,
  onToolChange,
  ledger,
  focusSearch,
  zoneStaff,
}: BuildPaletteProps) {
  const groups = useMemo(() => objectTypeGroups(), []);
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');

  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  const searching = query.trim().length > 0;
  const objectId = armedObject(tool);
  const brush = armedBrush(tool);
  const styles = styleStripFor(tool);

  const toggle = (category: string) => (): void =>
    setShut((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });

  return (
    <div className="hud-palette">
      <BuildPaletteHead
        count={countTypes(shown)}
        query={query}
        onQueryChange={setQuery}
        focusSearch={focusSearch}
        armed={armedLabel(tool)}
        onDisarm={() => onToolChange(null)}
        styles={styles}
        preview={preview}
        onStyle={(style) => styles && onToolChange({ kind: 'object', id: styles.family, style })}
      />

      <div className="hud-palette-shelves">
        <TerrainShelf
          open={!shut.has('terrain')}
          onToggle={toggle('terrain')}
          selected={brush}
          onSelect={(next) => onToolChange(next === null ? null : { kind: 'terrain', brush: next })}
        />

        <ZoneShelf
          open={!shut.has('zones')}
          onToggle={toggle('zones')}
          selected={armedZone(tool)}
          onSelect={(zone) => onToolChange(zone === null ? null : { kind: 'zone', zone })}
          staff={zoneStaff}
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
            ledger={ledger}
            onSelect={(next) => onToolChange(next === null ? null : { kind: 'object', id: next })}
          />
        ))}
        {shown.length === 0 ? (
          <p className="hud-palette-empty">Nothing in the catalogue answers to that.</p>
        ) : null}
      </div>
    </div>
  );
}
