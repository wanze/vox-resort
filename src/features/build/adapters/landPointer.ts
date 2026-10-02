import type { Camera } from 'three/webgpu';
import { levelHeight } from '../../layout/domain/elevation';
import { parcelOf, parcelRect } from '../../land/domain/landRights';
import type { PickGround } from '../domain/groundPick';
import type { PlacementGhost } from './placementGhost';
import { createTileStroke } from './tileStroke';

export interface LandPointerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: () => Camera;
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly ground: PickGround;
  // For sale and affordable, asked afresh per hover: a purchase puts its neighbours on sale.
  readonly canBuy: (px: number, pz: number) => boolean;
  readonly onBuy: (px: number, pz: number) => void;
  readonly onCancel: () => void;
}

export interface LandPointer {
  select(armed: boolean): void;
  dispose(): void;
}

// A drag buys each parcel it crosses, in order, so a strip can be bought in one stroke.
export function createLandPointer(options: LandPointerOptions): LandPointer {
  const { ghost, ground, canBuy, onBuy } = options;
  let armed = false;

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    ground,
    paints: () => true,
    onHover(tile) {
      if (!armed || !tile) {
        ghost.hide();
        return;
      }
      const { px, pz } = parcelOf(tile.x, tile.z);
      ghost.showParcel(
        parcelRect(px, pz),
        levelHeight(ground.levelOf(tile.x, tile.z)),
        !canBuy(px, pz),
      );
    },
    // Every tile of a drag lands here; a parcel already bought is simply no longer for sale.
    onTile(tile) {
      if (!armed) return;
      const { px, pz } = parcelOf(tile.x, tile.z);
      onBuy(px, pz);
    },
    onCancel: options.onCancel,
  });

  return {
    select(next) {
      armed = next;
      stroke.arm(next);
    },
    dispose() {
      stroke.dispose();
    },
  };
}
