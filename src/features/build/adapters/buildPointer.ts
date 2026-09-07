/**
 * The build gesture: hover to preview, click to place, drag to draw a path.
 *
 * Only the events and the camera live here — where a pointer lands, what may
 * stand there and which tiles a drag crossed are all decided in `domain/`.
 *
 * The one thing worth explaining is the mouse buttons. `OrbitControls` owns the
 * left button, and a build mode needs it: a left-drag that both orbits the
 * camera and paves a path is unusable. So while a type is selected the left
 * button is taken off the controls and the right button orbits in its place
 * (shift-right still pans, which `OrbitControls` gives us for free). Deselecting
 * hands the camera back exactly the buttons it started with, rather than the
 * defaults, so nothing else that configures the controls is quietly overwritten.
 */

import { MOUSE, Matrix4, TOUCH, type PerspectiveCamera } from "three/webgpu";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LayoutItem, Placement, Tile } from "../../layout/domain/resortLayout";
import { isPaintable, planAt, tilesBetween } from "../domain/buildPlan";
import { pickTile } from "../domain/groundPick";
import type { TileOccupancy } from "../domain/tileOccupancy";
import type { PlacementGhost } from "./placementGhost";

export interface BuildPointerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly ghost: PlacementGhost;
  /** What already stands on the plot; the pointer only reads it. */
  readonly occupancy: TileOccupancy;
  /** Stands one object. The caller owns the world and the occupancy index. */
  readonly onPlace: (placement: Placement) => void;
  /** Called when the gesture itself ends build mode, so the HUD can follow. */
  readonly onCancel: () => void;
}

export interface BuildPointer {
  /** Picks the type to place, or null to leave build mode. */
  select(item: LayoutItem | null): void;
  dispose(): void;
}

export function createBuildPointer(options: BuildPointerOptions): BuildPointer {
  const { canvas, camera, controls, ghost, occupancy, onPlace, onCancel } = options;

  // Reused across pointer moves: picking must not hand the collector work while
  // the mouse is being dragged across the plot.
  const inverseViewProjection = new Matrix4();

  const cameraButtons = { ...controls.mouseButtons };
  const cameraTouches = { ...controls.touches };

  let item: LayoutItem | null = null;
  /** The tile the last paint step reached, or null when nothing is being drawn. */
  let painting: Tile | null = null;

  const viewport = () => ({
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
  });

  const tileUnder = (event: PointerEvent): Tile | null => {
    camera.updateMatrixWorld();
    inverseViewProjection
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .invert();
    const bounds = canvas.getBoundingClientRect();
    return pickTile(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport(),
      inverseViewProjection.elements,
    );
  };

  /** Redraws the preview for the tile under the pointer. */
  const preview = (tile: Tile | null): void => {
    if (!item || !tile) {
      ghost.hide();
      return;
    }
    const plan = planAt(item, tile, occupancy);
    ghost.show(plan.placement, plan.blocked);
  };

  const placeOn = (tile: Tile): void => {
    if (!item) return;
    const plan = planAt(item, tile, occupancy);
    if (plan.blocked) return;
    onPlace(plan.placement);
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
    ghost.hide();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !item) return;
    onCancel();
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  globalThis.addEventListener("keydown", onKeyDown);

  return {
    select(next) {
      item = next;
      painting = null;
      ghost.hide();
      canvas.style.cursor = next ? "crosshair" : "";
      controls.mouseButtons = next
        ? { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
        : { ...cameraButtons };
      controls.touches = next ? { ONE: null, TWO: TOUCH.DOLLY_PAN } : { ...cameraTouches };
    },
    dispose() {
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      globalThis.removeEventListener("keydown", onKeyDown);
      canvas.style.cursor = "";
      controls.mouseButtons = { ...cameraButtons };
      controls.touches = { ...cameraTouches };
    },
  };
}
