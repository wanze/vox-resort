import { Matrix4, type Camera } from 'three/webgpu';
import type { Tile } from '../../layout/domain/resortLayout';
import { tilesBetween } from '../domain/buildPlan';
import { pickTile, type PickGround } from '../domain/groundPick';

export interface TileStrokeOptions {
  readonly canvas: HTMLCanvasElement;
  // Read afresh per pick: which camera is on screen changes with the mode.
  readonly camera: () => Camera;
  // A left-drag that both moves the camera and works tiles is unusable, so a tool borrows it.
  readonly takeLeftButton: (taken: boolean) => void;
  readonly ground: PickGround;
  readonly paints: () => boolean;
  readonly onHover: (tile: Tile | null) => void;
  // One tile at a time, in order: both tools read ground the stroke itself has just
  // changed, so planning the run up front would give a different result.
  readonly onTile: (tile: Tile) => void;
  readonly onCancel: () => void;
  readonly onKey?: (event: KeyboardEvent) => void;
}

export interface TileStroke {
  arm(armed: boolean): void;
  refresh(): void;
  dispose(): void;
}

// Fields only: a clicked palette button keeps focus, and its shortcut must still work.
function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

export function createTileStroke(options: TileStrokeOptions): TileStroke {
  const { canvas, camera, ground, paints, onHover, onTile, onCancel, takeLeftButton } = options;
  const onKey = options.onKey ?? (() => {});

  // Reused so picking does not allocate while the mouse is dragged.
  const inverseViewProjection = new Matrix4();

  let armed = false;
  let painting: Tile | null = null;
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

  // Bresenham between samples, so a quick drag draws a continuous run, not a dotted one.
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
    // Through preview, so a refresh with the pointer off the canvas has nothing stale to redraw.
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
