import type { Camera } from 'three/webgpu';
import type { Placement, Tile } from '../../layout/domain/resortLayout';
import { levelHeight } from '../../layout/domain/elevation';
import type { TerrainTile } from '../../layout/domain/terrain';
import { terrainChangeAt, type TerrainBrush, type TerrainRules } from '../domain/terrainBrush';
import { reRailAround, type HandrailRules } from '../domain/handrails';
import type { PickGround } from '../domain/groundPick';
import type { PlacementGhost } from './placementGhost';
import { createTileStroke } from './tileStroke';

export interface TerrainPointerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: () => Camera;
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ghost: PlacementGhost;
  readonly ground: PickGround;
  readonly rules: TerrainRules;
  readonly handrails: HandrailRules;
  readonly onDig: (tile: Tile, next: TerrainTile) => void;
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  readonly onCancel: () => void;
}

export interface TerrainPointer {
  select(brush: TerrainBrush | null): void;
  dispose(): void;
}

export function createTerrainPointer(options: TerrainPointerOptions): TerrainPointer {
  const { ghost, rules, handrails, onDig, onRails } = options;

  let brush: TerrainBrush | null = null;

  const stroke = createTileStroke({
    canvas: options.canvas,
    camera: options.camera,
    takeLeftButton: options.takeLeftButton,
    ground: options.ground,
    paints: () => true,
    onHover(tile) {
      if (!brush || !tile) {
        ghost.hide();
        return;
      }
      const change = terrainChangeAt(brush, tile, rules);
      ghost.showGround(tile, levelHeight(rules.terrain.levelOf(tile.x, tile.z)), change.blocked);
    },
    onTile(tile) {
      if (!brush) return;
      const change = terrainChangeAt(brush, tile, rules);
      if (!change.next) return;
      onDig(tile, change.next);
      // Re-railed after the ground has moved: a rail depends on the ground beside it.
      reRailAround(tile, handrails, onRails);
    },
    onCancel: options.onCancel,
  });

  return {
    select(next) {
      brush = next;
      stroke.arm(next !== null);
    },
    dispose() {
      stroke.dispose();
    },
  };
}
