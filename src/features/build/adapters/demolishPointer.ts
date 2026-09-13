/**
 * The bulldozer gesture: what a click and a drag mean once it is armed.
 *
 * The third sibling of `buildPointer.ts` and `terrainPointer.ts`, and their
 * shape for their reason: the events, the pick and the drag are `tileStroke.ts`,
 * what a tile gives up is `domain/demolish.ts`, and what is left here is the
 * order the questions are asked in.
 *
 * **Every stroke paints.** Clearing a run of paving is the obvious use of a
 * bulldozer, and a drag is how a run is drawn. A drag that crosses a cottage
 * takes the cottage too — which is what dragging a bulldozer across one means.
 *
 * **The cursor is what would go.** The footprint of the thing under the pointer,
 * all of it rather than the tile the pointer is on, in the refused tint. Over bare
 * ground there is nothing to mark, so nothing is drawn.
 *
 * **A demolition is a placement run backwards**, and asks the same two follow-up
 * questions the build pointer does, in the same order, once the tile is clear:
 * whether the paving beside it has to be laid again — a flight whose top was just
 * taken up is not a flight any more — and which rails the ground around it now
 * wants. Both are only asked when what came up was paving; nothing else changes
 * either answer. See `paving.ts`, `unlaidBy`, and `handrails.ts`.
 */

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
  /** Read afresh per pick: which camera is on screen changes with the mode. */
  readonly camera: () => Camera;
  /** Borrows the left mouse button off the camera, or hands it back. */
  readonly takeLeftButton: (taken: boolean) => void;
  /** The cursor, which for the bulldozer is the footprint of what would go. */
  readonly ghost: PlacementGhost;
  /** What stands on the plot; the pointer only reads it. */
  readonly occupancy: TileOccupancy;
  /** How high the ground is: what the pick aims at. */
  readonly ground: PickGround;
  /** What paving stands where, and what it becomes; see `paving.ts`. */
  readonly paving: PavingRules;
  /** Which tiles want holding on to once something is gone; see `handrails.ts`. */
  readonly handrails: HandrailRules;
  /** The placement standing under a key, which the occupancy index only names. */
  readonly placementOf: (key: string) => Placement | undefined;
  /**
   * Takes one placement off the plot. The caller owns the world and everything
   * else a placement touches — this does not remove it itself, for the reason the
   * build pointer does not add one.
   */
  readonly onDemolish: (placement: Placement) => void;
  /** Stands one placement in place of another; the build pointer's `onPlace`. */
  readonly onPlace: (placement: Placement, lifted?: Placement) => void;
  /** Stands and takes down handrails, exactly as the other two pointers' do. */
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  /** Called when the gesture itself ends demolition, so the HUD can follow. */
  readonly onCancel: () => void;
}

export interface DemolishPointer {
  /** Arms the bulldozer, or puts it down. */
  select(armed: boolean): void;
  dispose(): void;
}

export function createDemolishPointer(options: DemolishPointerOptions): DemolishPointer {
  const { ghost, occupancy, paving, handrails, placementOf, onDemolish, onPlace, onRails } =
    options;

  /**
   * What the bulldozer would take off a tile, if anything. No armed check: the
   * stroke only hovers or works a tile while it is armed, and it is armed exactly
   * when the bulldozer is.
   */
  const standingOn = (tile: Tile | null): Placement | undefined => {
    const key = tile ? demolishAt(tile, occupancy) : null;
    return key === null ? undefined : placementOf(key);
  };

  /**
   * Lays the paving beside a tile that was paved again where it has to be, then
   * re-rails the ground around it — the build pointer's two follow-up questions,
   * in its order.
   */
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
      // Asked before it goes, because afterwards the tile is bare either way.
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
