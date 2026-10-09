import { DropdownMenu } from '../../../shared/components/Dropdown';
import { MenuOption } from '../../../shared/components/MenuOption';
import { PixelIcon } from '../../../shared/components/PixelIcon';
import { OVERLAY_NAMES, OVERLAY_QUESTIONS } from './overlayNames';
import { OVERLAY_KINDS, type OverlayKind } from '../domain/overlays';
import { rampInto } from '../domain/ramp';

export interface OverlayControlProps {
  readonly kind: OverlayKind | null;
  readonly onKindChange: (kind: OverlayKind | null) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

// Both ends of the one ramp, worded for the layer; the high end is always the bad one.
const OVERLAY_ENDS: { readonly [kind in OverlayKind]: readonly [string, string] } = {
  footfall: ['quiet', 'busy'],
  mood: ['happy', 'unhappy'],
  'reach-food': ['near', 'far'],
  'reach-drink': ['near', 'far'],
  'reach-wash': ['near', 'far'],
  'step-free': ['step-free', 'stairs only'],
  scenery: ['pleasant', 'plain'],
  litter: ['clean', 'littered'],
  photos: ['few', 'many'],
};

const channel = (level: number): number => Math.round(level * 255);

const cssColourAt = (value: number): string => {
  const colour = { r: 0, g: 0, b: 0 };
  rampInto(value, colour);
  return `rgb(${channel(colour.r)} ${channel(colour.g)} ${channel(colour.b)})`;
};

// Worked out once: the ramp is fixed, and the legend is read off the same stops the tiles are.
const RAMP_GRADIENT = `linear-gradient(to right, ${cssColourAt(0)}, ${cssColourAt(0.5)}, ${cssColourAt(1)})`;

export interface OverlayOptionsProps {
  readonly kind: OverlayKind | null;
  readonly onKindChange: (kind: OverlayKind | null) => void;
  readonly onDone: () => void;
}

export function OverlayOptions({ kind, onKindChange, onDone }: OverlayOptionsProps) {
  const pick = (next: OverlayKind | null) => (): void => {
    onKindChange(next);
    onDone();
  };
  return (
    <>
      <MenuOption
        label="Off"
        note="show the resort as it is"
        checked={kind === null}
        onSelect={pick(null)}
      />
      <hr className="ui-rule" />
      {OVERLAY_KINDS.map((each) => (
        <MenuOption
          key={each}
          label={OVERLAY_NAMES[each]}
          note={OVERLAY_QUESTIONS[each]}
          checked={kind === each}
          onSelect={pick(each)}
        />
      ))}
    </>
  );
}

export function OverlayControl({ kind, onKindChange, open, onOpenChange }: OverlayControlProps) {
  return (
    <div className="overlays">
      <DropdownMenu
        open={open}
        onOpenChange={onOpenChange}
        title={kind ? `Map view: ${OVERLAY_QUESTIONS[kind]}` : 'Map view'}
        label={
          <>
            <PixelIcon name="overlay" />
            <span className="ui-chip-label">{kind ? OVERLAY_NAMES[kind] : 'Maps'}</span>
          </>
        }
      >
        <OverlayOptions
          kind={kind}
          onKindChange={onKindChange}
          onDone={() => onOpenChange(false)}
        />
      </DropdownMenu>
      {kind ? (
        <p className="ui-panel overlays-legend">
          <span>{OVERLAY_ENDS[kind][0]}</span>
          <span className="overlays-ramp" style={{ backgroundImage: RAMP_GRADIENT }} />
          <span>{OVERLAY_ENDS[kind][1]}</span>
        </p>
      ) : null}
    </div>
  );
}
