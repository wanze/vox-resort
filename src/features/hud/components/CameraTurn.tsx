import { PixelIcon } from '../../../shared/components/PixelIcon';
import { turnDirection } from '../../layout/domain/worldBounds';
import type { CameraControls } from './hudControls';

export interface CameraTurnProps {
  readonly camera: CameraControls;
  readonly shown: boolean;
}

// A phone has no Q and E, and a finger already orbits the perspective camera, so these turn
// only the isometric one. Bottom right, where a thumb rests, off the bar's crowded row.
export function CameraTurn({ camera, shown }: CameraTurnProps) {
  if (!shown || camera.view.mode !== 'isometric') return null;
  const turn = (quarters: number) => (): void =>
    camera.setDirection(turnDirection(camera.view.direction, quarters));
  return (
    <div className="ui-plate hud-turn" role="group" aria-label="Turn the camera">
      <button
        type="button"
        className="ui-button-large hud-turn-left"
        aria-label="Turn left"
        title="Turn left"
        onClick={turn(-1)}
      >
        <PixelIcon name="turn" />
      </button>
      <button
        type="button"
        className="ui-button-large"
        aria-label="Turn right"
        title="Turn right"
        onClick={turn(1)}
      >
        <PixelIcon name="turn" />
      </button>
    </div>
  );
}
