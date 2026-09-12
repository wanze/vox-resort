/**
 * The build gesture: what a click and a drag *mean* once an object is armed.
 *
 * The events, the pick and the drag itself are `tileStroke.ts`, which the terrain
 * tool shares; the rules are all in `domain/`. What is left here is the three
 * questions a placement asks and the order they have to be asked in.
 *
 * What is going down is not always what was picked: a path drawn over a terrace
 * step comes out as the flight up it, a path drawn off the shore comes out as a
 * jetty, a path drawn over a river comes out as a bridge, and the slab a path was
 * drawn from may be lifted and laid again as a flight. `paving.ts` owns those
 * rules; this only asks them, once per tile, so the ghost previews the flight or
 * the span and the click stands it. It asks the same module what the ground will
 * *take*, too — water takes a span and nothing else — so a cottage dropped in
 * the bay previews red.
 *
 * A paved tile also brings handrails with it, and takes others away — the rail
 * along an edge the new paving now carries on across. `handrails.ts` owns that
 * rule; this asks it once per tile placed, after the paving has settled. The
 * ghost previews the paving only: a rail stands on the tile beside the pointer as
 * often as on the one under it, and a preview of the neighbourhood would be
 * showing you an answer to a question you have not asked yet.
 *
 * The other thing this owns is which way round the object is going down. `R`
 * turns it a quarter, shift-`R` the other way, and the turn is kept across
 * placements rather than reset per click — a row of cottages all facing the
 * street is a thing someone builds on purpose, and re-pressing `R` for each one
 * would be the tax on it. Picking a different type does reset it, because the
 * turn was chosen for the object that is no longer being placed.
 *
 * **A drag paints, but only for a one-tile object.** Dragging a hotel across the
 * plot would stamp a row of hotels nobody asked for, whereas dragging a path is
 * exactly how a path gets drawn. See `isPaintable`.
 */

import type { Camera } from 'three/webgpu';
import type { LayoutItem, Placement, Tile } from '../../layout/domain/resortLayout';
import { normalizeRotation, type Rotation } from '../../layout/domain/rotation';
import { isPaintable, planAt } from '../domain/buildPlan';
import type { PickGround } from '../domain/groundPick';
import { pavingAt, relaidBy, standsOn, type PavingRules } from '../domain/paving';
import { reRailAround, type HandrailRules } from '../domain/handrails';
import type { TileOccupancy } from '../domain/tileOccupancy';
import type { PlacementGhost } from './placementGhost';
import { createTileStroke } from './tileStroke';

export interface BuildPointerOptions {
  readonly canvas: HTMLCanvasElement;
  /** Read afresh per pick: which camera is on screen changes with the mode. */
  readonly camera: () => Camera;
  /** Borrows the left mouse button off the camera, or hands it back. */
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  /** What already stands on the plot; the pointer only reads it. */
  readonly occupancy: TileOccupancy;
  /**
   * How high the ground is: what the pick aims at, and what the object being
   * placed stands on once it lands.
   */
  readonly ground: PickGround;
  /** What the ground makes of a tile of paving laid on it; see `paving.ts`. */
  readonly paving: PavingRules;
  /** Which tiles want holding on to, and which no longer do; see `handrails.ts`. */
  readonly handrails: HandrailRules;
  /**
   * Stands one object, taking up the placement it replaces first if there is
   * one. The caller owns the world and the occupancy index.
   *
   * Only paving ever replaces anything, and only with a flight of stairs: see
   * `paving.ts` for why drawing a path uphill has to lift the slab it laid a
   * moment ago.
   */
  readonly onPlace: (placement: Placement, lifted?: Placement) => void;
  /**
   * Stands and takes down handrails. Kept apart from `onPlace` because a rail
   * claims no tile of its own — it stands on the paving it guards — so the caller
   * must not put it in the occupancy index or under a blob shadow of its own.
   * See `handrails.ts`.
   */
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  /** Called when the gesture itself ends build mode, so the HUD can follow. */
  readonly onCancel: () => void;
}

export interface BuildPointer {
  /** Picks the type to place, or null to leave build mode. */
  select(item: LayoutItem | null): void;
  dispose(): void;
}

/** The turn a key press asks for, in quarters, or none at all. */
function turnAsked(event: KeyboardEvent): number {
  if (event.key.toLowerCase() !== 'r') return 0;
  return event.shiftKey ? -1 : 1;
}

export function createBuildPointer(options: BuildPointerOptions): BuildPointer {
  const { ghost, occupancy, ground, paving, handrails, onPlace, onRails } = options;

  let item: LayoutItem | null = null;
  /** Quarter turns the next object goes down at. */
  let rotation: Rotation = 0;

  /**
   * What would actually go down on a tile: a path over a terrace step is a
   * flight of stairs, and everything else is what was picked. Asked by the
   * preview as well as by the placement, so the ghost shows the stairs before
   * the click rather than surprising you after it.
   */
  const planOn = (picked: LayoutItem, tile: Tile) => {
    const laid = pavingAt(picked, tile, rotation, paving);
    return planAt(laid.item, tile, occupancy, laid.rotation, ground.levelOf, (under) =>
      standsOn(laid.item, under, paving),
    );
  };

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    ground,
    paints: () => item !== null && isPaintable(item),
    onHover(tile) {
      if (!item || !tile) {
        ghost.hide();
        return;
      }
      const plan = planOn(item, tile);
      ghost.show(plan.placement, plan.blocked);
    },
    onTile(tile) {
      if (!item) return;
      const plan = planOn(item, tile);
      if (plan.blocked) return;
      onPlace(plan.placement);
      // Asked after the tile is standing, because that is what turns the slab
      // below a step into the flight up it — see `paving.ts`.
      for (const relaid of relaidBy(tile, paving)) onPlace(relaid.placement, relaid.lifted);
      // Last of the three questions a placement asks, once what is paved and
      // what climbs are both settled: a rail is a fact about the ground *around*
      // a tile. See `handrails.ts`.
      reRailAround(tile, handrails, onRails);
    },
    onKey(event) {
      const quarters = turnAsked(event);
      if (quarters === 0) return;
      rotation = normalizeRotation(rotation + quarters);
      // Redrawn where the pointer already is, so the turn is visible without
      // having to nudge the mouse to find out what was asked for.
      stroke.refresh();
    },
    onCancel: options.onCancel,
  });

  return {
    select(next) {
      item = next;
      rotation = 0;
      stroke.arm(next !== null);
    },
    dispose() {
      stroke.dispose();
    },
  };
}
