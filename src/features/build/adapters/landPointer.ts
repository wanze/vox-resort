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
  readonly takeFinger: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly ground: PickGround;
  // For sale and affordable, asked afresh per hover: a purchase puts its neighbours on sale.
  readonly canBuy: (px: number, pz: number) => boolean;
  readonly onBuy: (px: number, pz: number) => void;
  readonly onCancel: () => void;
  // A parcel costs money and cannot be sold back, so a finger is asked to confirm it.
  readonly onPending?: (pending: boolean) => void;
}

export interface LandPointer {
  select(armed: boolean): void;
  confirm(): void;
  dismiss(): void;
  dispose(): void;
}

// A drag buys each parcel it crosses, in order, so a strip can be bought in one stroke.
export function createLandPointer(options: LandPointerOptions): LandPointer {
  const { ghost, ground, canBuy, onBuy } = options;
  const onPending = options.onPending ?? ((): void => {});
  let armed = false;

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    takeFinger: options.takeFinger,
    marker: options.ghost,
    ground,
    paints: () => true,
    placing: {
      confirms: () => true,
      onPending: (tile) => onPending(tile !== null),
      covers(anchor, tile) {
        const held = parcelOf(anchor.x, anchor.z);
        const under = parcelOf(tile.x, tile.z);
        return held.px === under.px && held.pz === under.pz;
      },
    },
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
    confirm: () => stroke.confirm(),
    dismiss: () => stroke.dismiss(),
    dispose() {
      stroke.dispose();
    },
  };
}
