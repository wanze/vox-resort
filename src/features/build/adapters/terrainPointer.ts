/**
 * The terrain gesture: what a click and a drag mean once a brush is armed.
 *
 * The sibling of `buildPointer.ts`, and deliberately its shape: the events, the
 * pick and the drag are `tileStroke.ts`, the rules are `domain/terrainBrush.ts`,
 * and what is left here is one question asked once per tile. Sculpting ground
 * and standing a cottage on it are the same gesture with a different meaning, and
 * two pointers that had drifted apart about what a drag is would be two tools
 * that felt unrelated.
 *
 * **Every brush paints.** That is the one place this differs from the build
 * pointer, which paints only a one-tile object: a brush *is* one tile, so a drag
 * is always a run of ground, and there is nothing a drag could stamp a row of.
 *
 * **The cursor is the footprint and nothing else.** A brush places no object, so
 * there is no model to preview — what the patch says is where the spade would go
 * and, red, that it would not. It is drawn at the height the ground *is* rather
 * than the height it would become, because the patch is the tile under the
 * pointer and the tile under the pointer has not moved yet.
 *
 * **One spadeful at a time, in order.** The feathering rule reads the ground the
 * stroke itself has just moved — a tile may only be raised to within a level of
 * its neighbours, and the neighbour the stroke lifted a moment ago counts. So a
 * drag applies each tile before planning the next, which is what makes a stroke
 * up a slope come out the same as the same tiles clicked one by one. It is the
 * same reason a paving stroke re-lays the slab behind it; see `paving.ts`.
 *
 * **Almost nothing is re-derived behind it.** A tile with anything standing on it
 * is refused outright — see `terrainBrush.ts` — so no placement, no slab and no
 * flight of stairs can ever be left sitting on ground that has moved under it.
 * A flight is safe for a sharper reason: a tile is a flight because a *paved*
 * neighbour stands a level higher, and the tile being dug is by definition not
 * paved, so no dig can create or destroy one.
 *
 * The handrails are the exception, and they have to be. A rail is a fact about
 * the ground *beside* a paved tile — whether it drops away, and whether it is
 * water — so raising the ground next to a promenade turns that edge from a drop
 * into a wall, and flooding it turns a lawn into something you could fall into.
 * `handrails.ts` already answers exactly this question as a diff over a tile and
 * its four neighbours, recomputed from scratch, so it is asked once per spadeful
 * after the ground has moved. It is the same call the build pointer makes after
 * laying a slab, for the same reason.
 */

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
  /** Read afresh per pick: which camera is on screen changes with the mode. */
  readonly camera: () => Camera;
  /** Borrows the left mouse button off the camera, or hands it back. */
  readonly takeLeftButton: (taken: boolean) => void;
  /** The cursor, which for a brush is the footprint patch alone. */
  readonly ghost: PlacementGhost;
  /** How high the ground is: what the pick aims at. */
  readonly ground: PickGround;
  /** The ground itself, and what is standing on it; see `terrainBrush.ts`. */
  readonly rules: TerrainRules;
  /** Which tiles beside the spade want holding on to; see `handrails.ts`. */
  readonly handrails: HandrailRules;
  /**
   * Changes one tile of ground. The caller owns the terrain and everything drawn
   * from it — this does not write the change itself, for the reason the build
   * pointer does not add its own placement to the world.
   */
  readonly onDig: (tile: Tile, next: TerrainTile) => void;
  /**
   * Stands and takes down handrails, exactly as the build pointer's does: a rail
   * claims no tile of its own, so the caller must not index one or shadow it.
   */
  readonly onRails: (stand: readonly Placement[], lift: readonly Placement[]) => void;
  /** Called when the gesture itself ends terrain mode, so the HUD can follow. */
  readonly onCancel: () => void;
}

export interface TerrainPointer {
  /** Picks the brush to work with, or null to leave terrain mode. */
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
      // Asked after the ground has moved, because what a rail guards is what the
      // ground beside it now is. See `handrails.ts`.
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
