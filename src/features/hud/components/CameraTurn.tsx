import { PixelIcon } from '../../../shared/components/PixelIcon';
import { turnDirection } from '../../layout/domain/worldBounds';
import type { CameraControls } from './hudControls';

export interface CameraTurnProps {
  readonly camera: CameraControls;
  readonly shown: boolean;
}

// A phone has no Q and E, and a finger already orbits the perspective camera, so this turns only
// the isometric one; one way is enough, as three turns are the other. Bottom right, where a thumb
// rests, off the bar's crowded row.
export function CameraTurn({ camera, shown }: CameraTurnProps) {
  if (!shown || camera.view.mode !== 'isometric') return null;
  const turn = (): void => camera.setDirection(turnDirection(camera.view.direction, 1));
  return (
    <div className="ui-plate hud-turn">
      <button
        type="button"
        className="ui-button-large"
        aria-label="Turn the camera clockwise"
        title="Turn clockwise"
        onClick={turn}
      >
        <PixelIcon name="turn" />
      </button>
    </div>
  );
}
