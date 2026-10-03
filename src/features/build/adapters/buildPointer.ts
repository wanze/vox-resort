import type { Camera } from 'three/webgpu';
import type { LayoutItem, Placement, Tile } from '../../layout/domain/resortLayout';
import { normalizeRotation, type Rotation } from '../../layout/domain/rotation';
import { isPaintable, planAt, type FitRule, type GroundRule } from '../domain/buildPlan';
import type { PickGround } from '../domain/groundPick';
import { fellBackToStairs, pavingAt, relaidBy, standsOn, type PavingRules } from '../domain/paving';
import { reRailAround, type HandrailRules } from '../domain/handrails';
import type { TileOccupancy } from '../domain/tileOccupancy';
import type { PlacementGhost } from './placementGhost';
import { createTileStroke } from './tileStroke';

export interface BuildPointerOptions {
  readonly canvas: HTMLCanvasElement;
  // Read afresh per pick: which camera is on screen changes with the mode.
  readonly camera: () => Camera;
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly occupancy: TileOccupancy;
  readonly ground: PickGround;
  readonly paving: PavingRules;
  readonly handrails: HandrailRules;
  // Apart from the paving's own ground rules: land not owned is refused whatever stands on it.
  readonly owns: GroundRule;
  readonly fits: FitRule;
  readonly onPlace: (placement: Placement, lifted?: Placement) => void;
  // A click the plan refused, for the player to be told why when it is not plain to see.
  readonly onBlocked: (placement: Placement) => void;
  // Kept apart from onPlace: a rail claims no tile, so it must not enter the occupancy index or get
  // a blob shadow of its own.
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  readonly onCancel: () => void;
  // Told whether the tile under the pointer would be a path's fallback flight, so the player learns
  // before painting that it will not be step-free.
  readonly onFallback?: (fellBack: boolean) => void;
  // Whether a placement waits for the player to confirm it, which only happens on touch.
  readonly onPending?: (pending: boolean) => void;
}

// Asked for every placement, so a random style rolls afresh for each tile of a drag.
export type ItemChooser = () => LayoutItem;

export interface BuildPointer {
  select(chooser: ItemChooser | null): void;
  // Another style of the same family: the rotation is kept.
  restyle(chooser: ItemChooser): void;
  turn(quarters: number): void;
  confirm(): void;
  dismiss(): void;
  dispose(): void;
}

function turnAsked(event: KeyboardEvent): number {
  if (event.key.toLowerCase() !== 'r') return 0;
  return event.shiftKey ? -1 : 1;
}

export function createBuildPointer(options: BuildPointerOptions): BuildPointer {
  const { ghost, occupancy, ground, paving, handrails, owns, fits, onPlace, onRails } = options;
  const onFallback = options.onFallback ?? ((): void => {});
  const onPending = options.onPending ?? ((): void => {});

  let chooser: ItemChooser | null = null;
  let item: LayoutItem | null = null;
  const nextItem = (): LayoutItem | null => chooser?.() ?? null;
  // Kept across placements so a row can face one way; reset when the type changes.
  let rotation: Rotation = 0;

  const planOn = (picked: LayoutItem, tile: Tile) => {
    const laid = pavingAt(picked, tile, rotation, paving);
    const plan = planAt(
      laid.item,
      tile,
      occupancy,
      laid.rotation,
      ground.levelOf,
      (under) => owns(under) && standsOn(laid.item, under, paving),
      fits,
    );
    return { ...plan, fellBack: !plan.blocked && fellBackToStairs(laid, paving) };
  };

  const turn = (quarters: number): void => {
    rotation = normalizeRotation(rotation + quarters);
    // Redrawn in place so the turn shows without nudging the mouse.
    stroke.refresh();
  };

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    ground,
    paints: () => item !== null && isPaintable(item),
    confirms: () => item !== null && !isPaintable(item),
    onPending: (tile) => onPending(tile !== null),
    onHover(tile) {
      if (!item || !tile) {
        ghost.hide();
        onFallback(false);
        return;
      }
      const plan = planOn(item, tile);
      ghost.show(plan.placement, plan.blocked);
      onFallback(plan.fellBack);
    },
    onTile(tile) {
      if (!item) return;
      const plan = planOn(item, tile);
      if (plan.blocked) {
        options.onBlocked(plan.placement);
        return;
      }
      onPlace(plan.placement);
      // Asked after the tile is standing: that is what turns the slab below a step into the flight up it.
      for (const relaid of relaidBy(tile, paving)) onPlace(relaid.placement, relaid.lifted);
      // Last, once paving and climbs are settled: a rail is a fact about the ground around a tile.
      reRailAround(tile, handrails, onRails);
      item = nextItem();
    },
    onKey(event) {
      const quarters = turnAsked(event);
      if (quarters !== 0) turn(quarters);
    },
    onCancel: options.onCancel,
  });

  return {
    select(next) {
      chooser = next;
      item = nextItem();
      rotation = 0;
      stroke.arm(next !== null);
    },
    restyle(next) {
      chooser = next;
      item = next();
      stroke.refresh();
    },
    turn,
    confirm: () => stroke.confirm(),
    dismiss: () => stroke.dismiss(),
    dispose() {
      stroke.dispose();
    },
  };
}
