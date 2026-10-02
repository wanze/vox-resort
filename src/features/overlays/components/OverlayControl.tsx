import { HudDropdown } from '../../hud/components/HudDropdown';
import { HudOption } from '../../hud/components/HudOption';
import { PixelIcon } from '../../hud/components/PixelIcon';
import { OVERLAY_NAMES, OVERLAY_QUESTIONS } from './overlayNames';
import { OVERLAY_KINDS, type OverlayKind } from '../domain/overlays';
import { rampInto } from '../domain/ramp';

export interface OverlayControlProps {
  readonly kind: OverlayKind | null;
  readonly onKindChange: (kind: OverlayKind | null) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  // Not a layer: the markers stand over whichever layer is on, or none.
  readonly markers: boolean;
  readonly onMarkersChange: (shown: boolean) => void;
  readonly staff: boolean;
  readonly onStaffChange: (shown: boolean) => void;
}

// Both ends of the one ramp, worded for the layer; the high end is always the bad one.
const OVERLAY_ENDS: { readonly [kind in OverlayKind]: readonly [string, string] } = {
  footfall: ['quiet', 'busy'],
  mood: ['happy', 'unhappy'],
  'reach-food': ['near', 'far'],
  'reach-drink': ['near', 'far'],
  'reach-wash': ['near', 'far'],
  scenery: ['pleasant', 'plain'],
  litter: ['clean', 'littered'],
};

const channel = (level: number): number => Math.round(level * 255);

const cssColourAt = (value: number): string => {
  const colour = { r: 0, g: 0, b: 0 };
  rampInto(value, colour);
  return `rgb(${channel(colour.r)} ${channel(colour.g)} ${channel(colour.b)})`;
};

// Worked out once: the ramp is fixed, and the legend is read off the same stops the tiles are.
const RAMP_GRADIENT = `linear-gradient(to right, ${cssColourAt(0)}, ${cssColourAt(0.5)}, ${cssColourAt(1)})`;

export function OverlayControl({
  kind,
  onKindChange,
  open,
  onOpenChange,
  markers,
  onMarkersChange,
  staff,
  onStaffChange,
}: OverlayControlProps) {
  const pick = (next: OverlayKind | null) => (): void => {
    onKindChange(next);
    onOpenChange(false);
  };

  return (
    <div className="hud-overlay">
      <HudDropdown
        open={open}
        onOpenChange={onOpenChange}
        title={kind ? `Map view: ${OVERLAY_QUESTIONS[kind]}` : 'Map view'}
        label={
          <>
            <PixelIcon name="overlay" />
            <span className="hud-chip-label">{kind ? OVERLAY_NAMES[kind] : 'Map view'}</span>
          </>
        }
      >
        <HudOption
          label="Off"
          note="show the resort as it is"
          checked={kind === null}
          onSelect={pick(null)}
        />
        <hr className="hud-rule" />
        {OVERLAY_KINDS.map((each) => (
          <HudOption
            key={each}
            label={OVERLAY_NAMES[each]}
            note={OVERLAY_QUESTIONS[each]}
            checked={kind === each}
            onSelect={pick(each)}
          />
        ))}
        <hr className="hud-rule" />
        <HudOption
          label="Problem markers"
          note="pin a sign over every building in trouble"
          checked={markers}
          many
          onSelect={() => onMarkersChange(!markers)}
        />
        <HudOption
          label="Staff"
          note="pin every member of staff on duty (S)"
          checked={staff}
          many
          onSelect={() => onStaffChange(!staff)}
        />
      </HudDropdown>
      {kind ? (
        <p className="hud-overlay-legend">
          <span>{OVERLAY_ENDS[kind][0]}</span>
          <span className="hud-overlay-ramp" style={{ backgroundImage: RAMP_GRADIENT }} />
          <span>{OVERLAY_ENDS[kind][1]}</span>
        </p>
      ) : null}
    </div>
  );
}
