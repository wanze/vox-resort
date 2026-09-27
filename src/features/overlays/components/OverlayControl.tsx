import { OVERLAY_KINDS, type OverlayKind } from '../domain/overlays';
import { rampInto } from '../domain/ramp';

export interface OverlayControlProps {
  readonly kind: OverlayKind | null;
  readonly onKindChange: (kind: OverlayKind | null) => void;
}

// Kept here rather than in the domain so a phrase can change without touching it.
const OVERLAY_NAMES: { readonly [kind in OverlayKind]: string } = {
  footfall: 'Footfall',
  mood: 'Mood',
  'reach-food': 'Food',
  'reach-drink': 'Drink',
  'reach-wash': 'Wash',
  scenery: 'Scenery',
  litter: 'Litter',
};

const OVERLAY_QUESTIONS: { readonly [kind in OverlayKind]: string } = {
  footfall: 'Where guests walk',
  mood: 'Where guests are unhappy',
  'reach-food': 'How far to something to eat',
  'reach-drink': 'How far to something to drink',
  'reach-wash': 'How far to somewhere to wash',
  scenery: 'Where the walk is plain',
  litter: 'Where litter lies',
};

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

export function OverlayControl({ kind, onKindChange }: OverlayControlProps) {
  return (
    <div className="hud-weather hud-overlay" role="group" aria-label="Overlay">
      <button
        type="button"
        className="hud-weather-pick"
        aria-pressed={kind === null}
        title="Show the resort as it is"
        onClick={() => onKindChange(null)}
      >
        Off
      </button>
      {OVERLAY_KINDS.map((each) => (
        <button
          key={each}
          type="button"
          className="hud-weather-pick"
          aria-pressed={kind === each}
          title={OVERLAY_QUESTIONS[each]}
          onClick={() => onKindChange(each)}
        >
          {OVERLAY_NAMES[each]}
        </button>
      ))}
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
