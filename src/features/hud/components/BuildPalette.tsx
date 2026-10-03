import { useMemo, useState } from 'react';
import { BuildGrid, BuildGroup, type BuildGridProps } from './BuildGroup';
import { BuildPaletteHead } from './BuildPaletteHead';
import { BuildTools } from './BuildTools';
import { HudTabs } from './HudTabs';
import { ZoneChips } from './ZoneChips';
import { zoneLabel } from './zoneWords';
import {
  objectTypeById,
  objectTypeGroups,
  type ObjectTypeGroup,
} from '../../catalog/domain/objectTypes';
import { buildCostOf } from '../../catalog/domain/prices';
import { landToolLabel } from '../../land/components/landTool';
import type { LandView } from '../../land/domain/landRights';
import {
  armedBrush,
  armedLand,
  armedObject,
  armedRemove,
  armedZone,
  BULLDOZER,
  type BuildTool,
} from '../../build/domain/buildTool';
import { styleStripFor } from '../../build/domain/stylePick';
import { TERRAIN_BRUSHES, type TerrainBrush } from '../../build/domain/terrainBrush';
import { countTypes, filterGroups, footprintLabel } from '../domain/paletteFilter';
import { shownTab, tabOfObject } from '../domain/paletteTabs';
import type { Ledger } from '../../sim/domain/ledger';

// Injected rather than imported: the pictures come from the bundler, and components may not import
// adapters.
export type PreviewLookup = (modelId: string) => string | null;

// The tools that are not objects or brushes.
function toolLabel(tool: BuildTool | null, land: LandView | null): string | null {
  if (armedRemove(tool)) return BULLDOZER.label;
  return armedLand(tool) ? landToolLabel(land ?? { price: 0 }) : null;
}

function armedLabel(tool: BuildTool | null, land: LandView | null): string | null {
  const named = toolLabel(tool, land);
  if (named) return named;
  const id = armedObject(tool);
  if (id) return objectTypeById(id).label;
  const zone = armedZone(tool);
  if (zone !== null) return zoneLabel(zone);
  return brushLabel(armedBrush(tool));
}

// A touch player has no tooltip, so the bar says what the pressed tile costs and covers.
function armedDetail(tool: BuildTool | null): string | null {
  const id = armedObject(tool);
  if (!id) return null;
  return `${buildCostOf(id).toLocaleString('en-US')} · ${footprintLabel(objectTypeById(id))}`;
}

const groupOf = (groups: readonly ObjectTypeGroup[], category: string): ObjectTypeGroup =>
  groups.find((group) => group.category === category)!;

function brushLabel(brush: TerrainBrush | null): string | null {
  return TERRAIN_BRUSHES.find((entry) => entry.id === brush)?.label ?? null;
}

export interface BuildPaletteProps {
  readonly preview: PreviewLookup;
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly ledger: Ledger | null;
  readonly land: LandView | null;
  readonly focusSearch: boolean;
}

// Something armed from the command palette turns to its tab, so its tile shows pressed.
function useFollowedTab(groups: readonly ObjectTypeGroup[], objectId: string | null) {
  const [tab, setTab] = useState(() => tabOfObject(groups, objectId));
  const [seenId, setSeenId] = useState(objectId);
  if (objectId !== seenId) {
    setSeenId(objectId);
    if (objectId !== null) setTab(tabOfObject(groups, objectId) ?? tab);
  }
  return [shownTab(groups, tab), setTab] as const;
}

interface CatalogueProps {
  readonly groups: readonly ObjectTypeGroup[];
  readonly shown: readonly ObjectTypeGroup[];
  readonly searching: boolean;
  readonly current: string | null;
  readonly onPick: (tab: string) => void;
  readonly grid: Omit<BuildGridProps, 'group'>;
}

function Catalogue({ groups, shown, searching, current, onPick, grid }: CatalogueProps) {
  const open = groups.find((group) => group.category === current);
  if (searching) {
    return (
      <div className="hud-palette-shelves">
        {shown.map((group) => (
          <BuildGroup key={group.category} group={group} {...grid} />
        ))}
        {shown.length === 0 ? (
          <p className="hud-palette-empty">Nothing in the catalogue answers to that.</p>
        ) : null}
      </div>
    );
  }
  if (!open) return null;
  return (
    <>
      <HudTabs
        tabs={groups.map((group) => group.category)}
        current={open.category}
        onPick={onPick}
        titleOf={(category) => groupOf(groups, category).label}
        label="Catalogue"
      />
      <div className="hud-palette-shelves">
        <BuildGrid group={open} {...grid} />
      </div>
    </>
  );
}

export function BuildPalette({
  preview,
  tool,
  onToolChange,
  ledger,
  land,
  focusSearch,
}: BuildPaletteProps) {
  const groups = useMemo(() => objectTypeGroups(), []);
  const [query, setQuery] = useState('');
  const objectId = armedObject(tool);
  const [current, setTab] = useFollowedTab(groups, objectId);
  const shown = useMemo(() => filterGroups(groups, query), [groups, query]);
  const styles = styleStripFor(tool);

  return (
    <div className="hud-palette">
      <BuildPaletteHead
        count={countTypes(shown)}
        query={query}
        onQueryChange={setQuery}
        focusSearch={focusSearch}
        armed={armedLabel(tool, land)}
        armedDetail={armedDetail(tool)}
        onDisarm={() => onToolChange(null)}
        styles={styles}
        preview={preview}
        onStyle={(style) => styles && onToolChange({ kind: 'object', id: styles.family, style })}
      />
      <BuildTools tool={tool} onToolChange={onToolChange} land={land} preview={preview} />
      <ZoneChips tool={tool} onToolChange={onToolChange} />
      <Catalogue
        groups={groups}
        shown={shown}
        searching={query.trim().length > 0}
        current={current}
        onPick={setTab}
        grid={{
          preview,
          selected: objectId,
          ledger,
          onSelect: (next) => onToolChange(next === null ? null : { kind: 'object', id: next }),
        }}
      />
    </div>
  );
}
