/**
 * The gesture both editing tools are made of: hover to preview, click to work a
 * tile, drag to work a run of them.
 *
 * Only the events and the camera live here. Which tile the pointer is over is
 * `domain/groundPick.ts`, which tiles a drag crossed is `domain/buildPlan.ts`,
 * and what working a tile *means* belongs to whichever tool armed this — a
 * placement in `buildPointer.ts`, a spadeful of ground in `terrainPointer.ts`.
 * Neither of those has an event listener in it.
 *
 * It exists because the two tools had the same hundred lines in them, and they
 * are the lines it would be least obvious had drifted apart: a stroke that
 * painted from the pointer samples rather than from Bresenham comes out as a
 * dotted line only when the mouse is quick, and a stroke that forgot to capture
 * the pointer only misbehaves when the drag leaves the canvas.
 *
 * Three things are worth stating, and all three are shared by construction now
 * rather than by agreement:
 *
 * - **The mouse buttons.** The camera owns the left button and an editing tool
 *   needs it: a left-drag that both moves the camera and paves a path is
 *   unusable. So while a tool is armed the left button is taken off the camera
 *   and whatever it was doing moves to the right button in its place (shift-right
 *   still does the other thing, which `OrbitControls` gives us for free). What
 *   "whatever it was doing" means depends on which camera is on screen — the
 *   perspective view orbits with the left button, the isometric one pans — and
 *   the mode can change while a tool is armed, so the scene owns that swap and
 *   this only says when it applies. See `SceneHandle.takeLeftButton`.
 * - **A stroke is Bresenham, not the samples.** A pointer move jumps several
 *   tiles at a time when the camera is high or the mouse is quick, and a stroke
 *   that recorded only the samples would come out as a dotted line.
 * - **A tile is worked one at a time, in order.** Both tools have a rule that
 *   reads the ground the stroke itself has just changed — paving a tile can turn
 *   the slab beside it into a flight, and raising a tile changes what its
 *   neighbour may be raised to — so a stroke that planned its whole run up front
 *   and applied it afterwards would come out differently from the same run drawn
 *   slowly. Nothing here plans ahead.
 *
 * Whether a drag paints at all is the tool's to say: dragging a path is exactly
 * how a path gets drawn, and dragging a hotel would stamp a row of hotels nobody
 * asked for. See `paints`.
 */

import { Matrix4, type Camera } from 'three/webgpu';
import type { Tile } from '../../layout/domain/resortLayout';
import { tilesBetween } from '../domain/buildPlan';
import { pickTile, type PickGround } from '../domain/groundPick';

export interface TileStrokeOptions {
  readonly canvas: HTMLCanvasElement;
  /** Read afresh per pick: which camera is on screen changes with the mode. */
  readonly camera: () => Camera;
  /** Borrows the left mouse button off the camera, or hands it back. */
  readonly takeLeftButton: (taken: boolean) => void;
  /** How high the ground is: what the pick aims at. */
  readonly ground: PickGround;
  /** Whether holding the button down keeps working the tiles the pointer crosses. */
  readonly paints: () => boolean;
  /** Redraws the preview for the tile under the pointer, or for none at all. */
  readonly onHover: (tile: Tile | null) => void;
  /** Works one tile. Called once per tile of a stroke, in the order crossed. */
  readonly onTile: (tile: Tile) => void;
  /** Called when the gesture itself ends — Escape — so the HUD can follow. */
  readonly onCancel: () => void;
  /**
   * Any other key the tool wants while it is armed, already filtered of presses
   * typed into a field. The build tool's `R` is the only one so far.
   */
  readonly onKey?: (event: KeyboardEvent) => void;
}

export interface TileStroke {
  /** Arms the gesture, or disarms it; a disarmed stroke ignores every event. */
  arm(armed: boolean): void;
  /**
   * Redraws the preview where the pointer already is.
   *
   * For the tool that changes what it is holding without the pointer moving —
   * turning an object a quarter — so the change is visible without having to
   * nudge the mouse to find out what was asked for.
   */
  refresh(): void;
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

export function createTileStroke(options: TileStrokeOptions): TileStroke {
  const { canvas, camera, ground, paints, onHover, onTile, onCancel, takeLeftButton } = options;
  /** Hoisted so the key handler has one path rather than an optional call. */
  const onKey = options.onKey ?? (() => {});

  // Reused across pointer moves: picking must not hand the collector work while
  // the mouse is being dragged across the plot.
  const inverseViewProjection = new Matrix4();

  let armed = false;
  /** The tile the last paint step reached, or null when nothing is being drawn. */
  let painting: Tile | null = null;
  /** The tile the preview is currently drawn on, so a refresh can redraw it. */
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

  const preview = (tile: Tile | null): void => {
    hovered = tile;
    onHover(armed ? tile : null);
  };

  /**
   * Works every tile between where the stroke had got to and where the pointer
   * is now, so a quick drag draws a continuous run rather than a dotted one.
   */
  const paintTo = (from: Tile, to: Tile): void => {
    for (const step of tilesBetween(from, to)) onTile(step);
    painting = to;
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!armed) return;
    const tile = tileUnder(event);
    if (tile && painting) paintTo(painting, tile);
    preview(tile);
  };

  /** Works where the button went down, and arms the drag if the tool paints. */
  const startStroke = (tile: Tile, pointerId: number): void => {
    onTile(tile);
    if (!paints()) return;
    painting = tile;
    // Captured so a stroke that leaves the canvas mid-drag still ends here.
    canvas.setPointerCapture(pointerId);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!armed || event.button !== 0) return;
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
    // Through `preview` rather than straight to the tool, so a refresh asked for
    // with the pointer off the canvas has nothing stale to redraw.
    preview(null);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!armed || inAField(event.target)) return;
    if (event.key === 'Escape') onCancel();
    else onKey(event);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  globalThis.addEventListener('keydown', onKeyDown);

  return {
    arm(next) {
      armed = next;
      painting = null;
      hovered = null;
      onHover(null);
      canvas.style.cursor = next ? 'crosshair' : '';
      takeLeftButton(next);
    },
    refresh() {
      preview(hovered);
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
