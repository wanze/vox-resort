import type { CameraMode, CompassDirection } from '../../layout/domain/worldBounds';
import { COMPASS_DIRECTIONS } from '../../layout/domain/worldBounds';

export interface CameraPanelProps {
  readonly mode: CameraMode;
  readonly direction: CompassDirection;
  readonly onModeChange: (mode: CameraMode) => void;
  readonly onDirectionChange: (direction: CompassDirection) => void;
  readonly detail: boolean;
  readonly onDetailChange: (enabled: boolean) => void;
}

const MODES: readonly { readonly mode: CameraMode; readonly label: string }[] = [
  { mode: 'perspective', label: 'Perspective' },
  { mode: 'isometric', label: 'Isometric' },
];

const CORNERS: Readonly<Record<CompassDirection, { initials: string; label: string }>> = {
  northeast: { initials: 'NE', label: 'north-east' },
  southeast: { initials: 'SE', label: 'south-east' },
  southwest: { initials: 'SW', label: 'south-west' },
  northwest: { initials: 'NW', label: 'north-west' },
};

// The compass row stays in both modes, disabled outside isometric, so the panel
// does not change height under the pointer.
export function CameraPanel({
  mode,
  direction,
  onModeChange,
  onDirectionChange,
  detail,
  onDetailChange,
}: CameraPanelProps) {
  const isometric = mode === 'isometric';

  return (
    <div className="hud-camera">
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
            onClick={() => onDirectionChange(point)}
          >
            {CORNERS[point].initials}
          </button>
        ))}
      </div>

      {/* A toggle, because it exists to compare frame rate with it and without. */}
      <div className="hud-camera-modes" role="group" aria-label="Level of detail">
        <button
          type="button"
          className="hud-camera-mode"
          aria-pressed={detail}
          title="Draw far objects coarse and leave out ones too small to see"
          onClick={() => onDetailChange(!detail)}
        >
          Level of detail {detail ? 'on' : 'off'}
        </button>
      </div>
    </div>
  );
}
