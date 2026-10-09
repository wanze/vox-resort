import { isPaintable, layoutItemFor } from '../../build/domain/buildPlan';
import { armedLand, armedObject, type BuildTool } from '../../build/domain/buildTool';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import type { LandView } from '../../land/domain/landRights';
import { armedLabel } from './BuildPalette';
import { ObjectInfo } from './ObjectInfo';

export interface ArmedChipProps {
  readonly tool: BuildTool | null;
  readonly land: LandView | null;
  readonly pending: boolean;
  // The palette says what is armed itself; the chip stands in only while it is put away.
  readonly paletteOpen: boolean;
  readonly onOpen: () => void;
  readonly onDisarm: () => void;
}

// What a tap does with the tool, for a finger that has no tooltip to read.
function hintOf(tool: BuildTool | null): string {
  if (armedLand(tool)) return 'Tap a parcel to buy it';
  const id = armedObject(tool);
  if (id && !isPaintable(layoutItemFor(objectTypeById(id)))) return 'Tap to place, drag it to move';
  return 'Tap to start, drag from the mark';
}

function ArmedInfo({ tool }: { readonly tool: BuildTool | null }) {
  const id = armedObject(tool);
  return id ? <ObjectInfo typeId={id} className="ui-button-large" mode="toggle" scale={2} /> : null;
}

// Without it, a tool armed with its sheet closed would take the next tap with no sign of being there.
export function ArmedChip(props: ArmedChipProps) {
  const { tool, land, onOpen, onDisarm } = props;
  // The placement bar takes the spot while a building waits.
  const shown = !props.pending && !props.paletteOpen;
  const label = shown ? armedLabel(tool, land) : null;
  if (!label) return null;
  return (
    <div className="hud-placement ui-plate">
      <button type="button" className="ui-button-large hud-armed-open" onClick={onOpen}>
        <span className="hud-armed-name">{label}</span>
        <span className="hud-armed-hint">{hintOf(tool)}</span>
      </button>
      <ArmedInfo tool={tool} />
      <button
        type="button"
        className="ui-button-large"
        onClick={onDisarm}
        aria-label={`Stop placing ${label}`}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
