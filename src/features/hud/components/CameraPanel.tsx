import type { CameraMode, CompassDirection } from '../../layout/domain/worldBounds';
import { COMPASS_DIRECTIONS } from '../../layout/domain/worldBounds';

export interface CameraPanelProps {
  readonly mode: CameraMode;
  readonly direction: CompassDirection;
  readonly onModeChange: (mode: CameraMode) => void;
  readonly onDirectionChange: (direction: CompassDirection) => void;
}

const MODES: readonly { readonly mode: CameraMode; readonly label: string }[] = [
  { mode: 'perspective', label: 'Perspective' },
  { mode: 'isometric', label: 'Isometric' },
];

/** How each corner reads on a button and in a sentence. */
const CORNERS: Readonly<Record<CompassDirection, { initials: string; label: string }>> = {
  northeast: { initials: 'NE', label: 'north-east' },
  southeast: { initials: 'SE', label: 'south-east' },
  southwest: { initials: 'SW', label: 'south-west' },
  northwest: { initials: 'NW', label: 'north-west' },
};

/**
 * The camera panel: which view the resort is drawn through, and which corner the
 * isometric one stands over.
 *
 * The compass row stays on screen in both modes rather than appearing with the
 * isometric view, so the panel does not change height under the pointer; it is
 * simply disabled, which is also what says the four corners belong to that mode
 * and not to the other one.
 */
export function CameraPanel({
  mode,
  direction,
  onModeChange,
  onDirectionChange,
}: CameraPanelProps) {
  const isometric = mode === 'isometric';

  return (
    <section className="hud-camera" aria-label="Camera">
      <header className="hud-camera-head">
        <h2>View</h2>
        <span className="hud-camera-key">C</span>
      </header>

      <div className="hud-camera-modes" role="group" aria-label="Camera mode">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="hud-camera-mode"
            aria-pressed={mode === option.mode}
            onClick={() => onModeChange(option.mode)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="hud-camera-compass" role="group" aria-label="Isometric corner">
        {COMPASS_DIRECTIONS.map((point) => (
          <button
            key={point}
            type="button"
            className="hud-camera-point"
            disabled={!isometric}
            aria-pressed={isometric && direction === point}
            aria-label={`Face the plot from the ${CORNERS[point].label}`}
            title={`From the ${CORNERS[point].label}`}
            onClick={() => onDirectionChange(point)}
          >
            {CORNERS[point].initials}
          </button>
        ))}
      </div>

      <p className="hud-camera-hint">
        {isometric
          ? `Orthographic, from the ${CORNERS[direction].label}. Q and E turn it a quarter; drag to pan, wheel to zoom.`
          : 'Free camera. Drag to orbit, right-drag to pan, wheel to dolly.'}
      </p>
    </section>
  );
}
