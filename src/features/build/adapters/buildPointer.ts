/**
 * The build gesture: hover to preview, click to place, drag to draw a path.
 *
 * Only the events and the camera live here — where a pointer lands, what may
 * stand there and which tiles a drag crossed are all decided in `domain/`.
 *
 * The one thing worth explaining is the mouse buttons. The camera owns the left
 * button, and a build mode needs it: a left-drag that both moves the camera and
 * paves a path is unusable. So while a type is selected the left button is taken
 * off the camera and whatever it was doing moves to the right button in its
 * place (shift-right still does the other thing, which `OrbitControls` gives us
 * for free). What "whatever it was doing" means depends on which camera is on
 * screen — the perspective view orbits with the left button, the isometric one
 * pans — and the mode can change while a type is armed, so the scene owns that
 * swap and this only says when it applies. See `SceneHandle.takeLeftButton`.
 *
 * What is going down is not always what was picked, either: a path drawn over a
 * terrace step comes out as the flight up it, and the slab it was drawn from may
 * be lifted and laid again as one. `paving.ts` owns that rule; this only asks it,
 * once per tile, so the ghost previews the flight and the click stands it.
 *
 * The other thing this owns is which way round the object is going down. `R`
 * turns it a quarter, shift-`R` the other way, and the turn is kept across
 * placements rather than reset per click — a row of cottages all facing the
 * street is a thing someone builds on purpose, and re-pressing `R` for each one
 * would be the tax on it. Picking a different type does reset it, because the
 * turn was chosen for the object that is no longer being placed.
 */

import { Matrix4, type Camera } from 'three/webgpu';
import type { LayoutItem, Placement, Tile } from '../../layout/domain/resortLayout';
import { normalizeRotation, type Rotation } from '../../layout/domain/rotation';
import { isPaintable, planAt, tilesBetween } from '../domain/buildPlan';
import { pickTile, type PickGround } from '../domain/groundPick';
import { pavingAt, relaidBy, type PavingRules } from '../domain/paving';
import type { TileOccupancy } from '../domain/tileOccupancy';
import type { PlacementGhost } from './placementGhost';

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
  /**
   * Stands one object, taking up the placement it replaces first if there is
   * one. The caller owns the world and the occupancy index.
   *
   * Only paving ever replaces anything, and only with a flight of stairs: see
   * `paving.ts` for why drawing a path uphill has to lift the slab it laid a
   * moment ago.
   */
  readonly onPlace: (placement: Placement, lifted?: Placement) => void;
  /** Called when the gesture itself ends build mode, so the HUD can follow. */
  readonly onCancel: () => void;
}

export interface BuildPointer {
  /** Picks the type to place, or null to leave build mode. */
  select(item: LayoutItem | null): void;
  dispose(): void;
}

/**
 * Whether a key press was typed into a field rather than aimed at the scene.
 *
 * Fields, and only fields: clicking a palette button leaves the focus on it, so
 * a rule that ignored every focusable thing would ignore the very key the
 * palette had just told the user about.
 */
function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

/** The turn a key press asks for, in quarters, or none at all. */
function turnAsked(event: KeyboardEvent): number {
  if (event.key.toLowerCase() !== 'r' || inAField(event.target)) return 0;
  return event.shiftKey ? -1 : 1;
}

export function createBuildPointer(options: BuildPointerOptions): BuildPointer {
  const { canvas, camera, ghost, occupancy, ground, paving, onPlace, onCancel, takeLeftButton } =
    options;

  // Reused across pointer moves: picking must not hand the collector work while
  // the mouse is being dragged across the plot.
  const inverseViewProjection = new Matrix4();

  let item: LayoutItem | null = null;
  /** The tile the last paint step reached, or null when nothing is being drawn. */
  let painting: Tile | null = null;
  /** Quarter turns the next object goes down at. */
  let rotation: Rotation = 0;
  /**
   * The tile the preview is currently drawn on, so a turn can redraw it where
   * it stands rather than waiting for the pointer to move again.
   */
  let hovered: Tile | null = null;

  const viewport = () => ({
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
  });

  const tileUnder = (event: PointerEvent): Tile | null => {
    const eye = camera();
    eye.updateMatrixWorld();
    inverseViewProjection.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse).invert();
    const bounds = canvas.getBoundingClientRect();
    return pickTile(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport(),
      inverseViewProjection.elements,
      undefined,
      ground,
    );
  };

  /**
   * What would actually go down on a tile: a path over a terrace step is a
   * flight of stairs, and everything else is what was picked. Asked by the
   * preview as well as by the placement, so the ghost shows the stairs before
   * the click rather than surprising you after it.
   */
  const planOn = (picked: LayoutItem, tile: Tile) => {
    const laid = pavingAt(picked, tile, rotation, paving);
    return planAt(laid.item, tile, occupancy, laid.rotation, ground.levelOf);
  };

  /** Redraws the preview for the tile under the pointer. */
  const preview = (tile: Tile | null): void => {
    hovered = tile;
    if (!item || !tile) {
      ghost.hide();
      return;
    }
    const plan = planOn(item, tile);
    ghost.show(plan.placement, plan.blocked);
  };

  const placeOn = (tile: Tile): void => {
    if (!item) return;
    const plan = planOn(item, tile);
    if (plan.blocked) return;
    onPlace(plan.placement);
    // Asked after the tile is standing, because that is what turns the slab
    // below a step into the flight up it — see `paving.ts`.
    for (const relaid of relaidBy(tile, paving)) onPlace(relaid.placement, relaid.lifted);
  };

  /**
   * Paints every tile between where the stroke had got to and where the pointer
   * is now, so a quick drag draws a continuous path rather than a dotted one.
   */
  const paintTo = (from: Tile, to: Tile): void => {
    for (const step of tilesBetween(from, to)) placeOn(step);
    painting = to;
  };

  /** Places where the button went down, and arms the drag if the type paints. */
  const startStroke = (tile: Tile, pointerId: number): void => {
    placeOn(tile);
    if (!item || !isPaintable(item)) return;
    painting = tile;
    // Captured so a stroke that leaves the canvas mid-drag still ends here.
    canvas.setPointerCapture(pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!item) return;
    const tile = tileUnder(event);
    if (tile && painting) paintTo(painting, tile);
    preview(tile);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!item || event.button !== 0) return;
    const tile = tileUnder(event);
    if (tile) startStroke(tile, event.pointerId);
    preview(tile);
  };

  const onPointerUp = (event: PointerEvent): void => {
    painting = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const onPointerLeave = (): void => {
    painting = null;
    // Through `preview` rather than straight to `hide`, so a turn pressed with
    // the pointer off the canvas has nothing stale to redraw.
    preview(null);
  };

  /**
   * Turns what is about to be placed, and redraws the preview where the pointer
   * already is — so the turn is visible without having to nudge the mouse to
   * find out what was asked for.
   */
  const turnBy = (quarters: number): void => {
    rotation = normalizeRotation(rotation + quarters);
    preview(hovered);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!item) return;
    if (event.key === 'Escape') {
      onCancel();
      return;
    }
    const quarters = turnAsked(event);
    if (quarters !== 0) turnBy(quarters);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  globalThis.addEventListener('keydown', onKeyDown);

  return {
    select(next) {
      item = next;
      painting = null;
      rotation = 0;
      hovered = null;
      ghost.hide();
      canvas.style.cursor = next ? 'crosshair' : '';
      takeLeftButton(next !== null);
    },
    dispose() {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      globalThis.removeEventListener('keydown', onKeyDown);
      canvas.style.cursor = '';
      takeLeftButton(false);
    },
  };
}
