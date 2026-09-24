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
  // Read afresh per pick: which camera is on screen changes with the mode.
  readonly camera: () => Camera;
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly occupancy: TileOccupancy;
  readonly ground: PickGround;
  readonly paving: PavingRules;
  readonly handrails: HandrailRules;
  readonly onPlace: (placement: Placement, lifted?: Placement) => void;
  // Kept apart from onPlace: a rail claims no tile, so it must not enter the occupancy index or get
  // a blob shadow of its own.
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  readonly onCancel: () => void;
}

export interface BuildPointer {
  select(item: LayoutItem | null): void;
  dispose(): void;
}

function turnAsked(event: KeyboardEvent): number {
  if (event.key.toLowerCase() !== 'r') return 0;
  return event.shiftKey ? -1 : 1;
}

export function createBuildPointer(options: BuildPointerOptions): BuildPointer {
  const { ghost, occupancy, ground, paving, handrails, onPlace, onRails } = options;

  let item: LayoutItem | null = null;
  // Kept across placements so a row can face one way; reset when the type changes.
  let rotation: Rotation = 0;

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
      // Asked after the tile is standing: that is what turns the slab below a step into the flight up it.
      for (const relaid of relaidBy(tile, paving)) onPlace(relaid.placement, relaid.lifted);
      // Last, once paving and climbs are settled: a rail is a fact about the ground around a tile.
      reRailAround(tile, handrails, onRails);
    },
    onKey(event) {
      const quarters = turnAsked(event);
      if (quarters === 0) return;
      rotation = normalizeRotation(rotation + quarters);
      // Redrawn in place so the turn shows without nudging the mouse.
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
