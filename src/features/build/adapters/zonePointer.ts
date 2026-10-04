import type { Camera } from 'three/webgpu';
import type { Tile } from '../../layout/domain/resortLayout';
import { levelHeight } from '../../layout/domain/elevation';
import type { PickGround } from '../domain/groundPick';
import type { PlacementGhost } from './placementGhost';
import { createTileStroke } from './tileStroke';

export interface ZonePointerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: () => Camera;
  readonly takeLeftButton: (taken: boolean) => void;
  readonly takeFinger: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly ground: PickGround;
  readonly onPaint: (tile: Tile, zone: number) => void;
  readonly onCancel: () => void;
}

export interface ZonePointer {
  select(zone: number | null): void;
  dispose(): void;
}

// Never blocked: a zone is paint on the plan, so any tile takes it, built on or not.
export function createZonePointer(options: ZonePointerOptions): ZonePointer {
  const { ghost, ground, onPaint } = options;

  let zone: number | null = null;

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    takeFinger: options.takeFinger,
    marker: options.ghost,
    ground,
    paints: () => true,
    onHover(tile) {
      if (zone === null || !tile) {
        ghost.hide();
        return;
      }
      ghost.showGround(tile, levelHeight(ground.levelOf(tile.x, tile.z)), false);
    },
    onTile(tile) {
      if (zone !== null) onPaint(tile, zone);
    },
    onCancel: options.onCancel,
  });

  return {
    select(next) {
      zone = next;
      stroke.arm(next !== null);
    },
    dispose() {
      stroke.dispose();
    },
  };
}
