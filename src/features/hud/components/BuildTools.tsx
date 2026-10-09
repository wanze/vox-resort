import { Fragment, useState, type ReactNode } from 'react';
import {
  armedBrush,
  armedLand,
  armedRemove,
  armedZone,
  BULLDOZER,
  type BuildTool,
} from '../../build/domain/buildTool';
import { TERRAIN_BRUSHES, type TerrainBrush } from '../../build/domain/terrainBrush';
import { TOOL_ART, type ToolArtKey } from '../../build/domain/toolArt';
import { LAND_TOOL, landToolLabel } from '../../land/components/landTool';
import type { LandView } from '../../land/domain/landRights';
import { NO_ZONE } from '../../sim/domain/zones';
import type { PreviewLookup } from './BuildPalette';
import { ZONE_BRUSHES } from './zoneWords';

export interface BuildToolsProps {
  readonly tool: BuildTool | null;
  readonly onToolChange: (tool: BuildTool | null) => void;
  readonly land: LandView | null;
  readonly preview: PreviewLookup;
}

function ToolButton(props: {
  readonly label: string;
  readonly title: string;
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="hud-build-tool"
      aria-pressed={props.pressed}
      aria-label={props.label}
      title={props.title}
      onClick={props.onPress}
    >
      <span className="hud-build-tool-art" aria-hidden="true">
        {props.children}
      </span>
    </button>
  );
}

// The glyph stands in until `pnpm preview` has drawn the tool, as a swatch does for a model.
// A mark rides on the picture where the voxels alone are too small to say which way: at button
// size a raised block and a pit are a few pixels apart.
function ToolPicture(props: {
  readonly preview: PreviewLookup;
  readonly art: ToolArtKey;
  readonly glyph: string;
  readonly marked?: boolean;
}) {
  const picture = props.preview(TOOL_ART[props.art]);
  if (!picture) return props.glyph;
  return (
    <>
      <img src={picture} alt="" draggable={false} />
      {props.marked ? <span className="hud-build-tool-mark">{props.glyph}</span> : null}
    </>
  );
}

const SHAPING: ReadonlySet<TerrainBrush> = new Set(['raise', 'lower']);

const BRUSH_GROUPS = [
  TERRAIN_BRUSHES.filter((each) => SHAPING.has(each.id)),
  TERRAIN_BRUSHES.filter((each) => !SHAPING.has(each.id)),
];

// Zones re-arms the zone painted last, so a player touching up one area keeps its colour.
function useLastZone(zone: number | null): number {
  const [lastZone, setLastZone] = useState(0);
  const painted = zone ?? NO_ZONE;
  if (painted !== NO_ZONE && painted !== lastZone) setLastZone(painted);
  return lastZone;
}

export function BuildTools({ tool, onToolChange, land, preview }: BuildToolsProps) {
  const brush = armedBrush(tool);
  const zone = armedZone(tool);
  const removing = armedRemove(tool);
  const claiming = armedLand(tool);
  const lastZone = useLastZone(zone);
  const toggle = (pressed: boolean, next: BuildTool) => (): void =>
    onToolChange(pressed ? null : next);

  return (
    <div className="hud-build-tools" role="toolbar" aria-label="Tools">
      {BRUSH_GROUPS.map((group) => (
        <Fragment key={group[0]!.id}>
          {group.map((each) => (
            <ToolButton
              key={each.id}
              label={each.label}
              title={`${each.label} — ${each.hint}, drag to work a run`}
              pressed={brush === each.id}
              onPress={toggle(brush === each.id, { kind: 'terrain', brush: each.id })}
            >
              <ToolPicture
                preview={preview}
                art={each.id}
                glyph={each.glyph}
                marked={SHAPING.has(each.id)}
              />
            </ToolButton>
          ))}
          <span className="hud-build-tools-rule" />
        </Fragment>
      ))}
      <ToolButton
        label="Zones"
        title="Zones — paint where staff work"
        pressed={zone !== null}
        onPress={toggle(zone !== null, { kind: 'zone', zone: lastZone })}
      >
        <span className="hud-build-tool-zones">
          {ZONE_BRUSHES.filter((each) => each.colour).map((each) => (
            <span key={each.zone} style={{ background: each.colour }} />
          ))}
        </span>
      </ToolButton>
      <ToolButton
        label={BULLDOZER.label}
        title={`${BULLDOZER.label} — ${BULLDOZER.hint}, drag to clear a run`}
        pressed={removing}
        onPress={toggle(removing, { kind: 'remove' })}
      >
        <ToolPicture preview={preview} art="remove" glyph={BULLDOZER.glyph} />
      </ToolButton>
      {land && land.forSale > 0 ? (
        <ToolButton
          label={landToolLabel(land)}
          title={`${landToolLabel(land)} — ${LAND_TOOL.hint}`}
          pressed={claiming}
          onPress={toggle(claiming, { kind: 'land' })}
        >
          <ToolPicture preview={preview} art="land" glyph={LAND_TOOL.glyph} />
        </ToolButton>
      ) : null}
    </div>
  );
}
