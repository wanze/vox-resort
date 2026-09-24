import type { Camera } from 'three/webgpu';
import type { Placement, Tile } from '../../layout/domain/resortLayout';
import { demolishAt } from '../domain/demolish';
import type { PickGround } from '../domain/groundPick';
import { reRailAround, type HandrailRules } from '../domain/handrails';
import { unlaidBy, type PavingRules } from '../domain/paving';
import type { TileOccupancy } from '../domain/tileOccupancy';
import type { PlacementGhost } from './placementGhost';
import { createTileStroke } from './tileStroke';

export interface DemolishPointerOptions {
  readonly canvas: HTMLCanvasElement;
  // Read afresh per pick: which camera is on screen changes with the mode.
  readonly camera: () => Camera;
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly occupancy: TileOccupancy;
  readonly ground: PickGround;
  readonly paving: PavingRules;
  readonly handrails: HandrailRules;
  readonly placementOf: (key: string) => Placement | undefined;
  readonly onDemolish: (placement: Placement) => void;
  readonly onPlace: (placement: Placement, lifted?: Placement) => void;
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  readonly onCancel: () => void;
}

export interface DemolishPointer {
  select(armed: boolean): void;
  dispose(): void;
}

export function createDemolishPointer(options: DemolishPointerOptions): DemolishPointer {
  const { ghost, occupancy, paving, handrails, placementOf, onDemolish, onPlace, onRails } =
    options;

  // No armed check: the stroke only hovers or works a tile while armed.
  const standingOn = (tile: Tile | null): Placement | undefined => {
    const key = tile ? demolishAt(tile, occupancy) : null;
    return key === null ? undefined : placementOf(key);
  };

  const settleAround = (tile: Tile): void => {
    for (const relaid of unlaidBy(tile, paving)) onPlace(relaid.placement, relaid.lifted);
    reRailAround(tile, handrails, onRails);
  };

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    ground: options.ground,
    paints: () => true,
    onHover(tile) {
      const standing = standingOn(tile);
      if (standing) ghost.showRemoval(standing);
      else ghost.hide();
    },
    onTile(tile) {
      const standing = standingOn(tile);
      if (!standing) return;
      // Asked before it goes, because afterwards the tile is bare either way; only
      // paving changes what the neighbouring flights and rails need.
      const paved = paving.pavedWith(tile.x, tile.z) !== null;
      onDemolish(standing);
      if (paved) settleAround(tile);
    },
    onCancel: options.onCancel,
  });

  return {
    select(armed) {
      stroke.arm(armed);
    },
    dispose() {
      stroke.dispose();
    },
  };
}
