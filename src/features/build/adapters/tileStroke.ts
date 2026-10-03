import { Matrix4, type Camera } from 'three/webgpu';
import type { Tile } from '../../layout/domain/resortLayout';
import { tilesBetween } from '../domain/buildPlan';
import { pickTile, type PickGround } from '../domain/groundPick';
import {
  gateCancel,
  gateDown,
  gateMove,
  gateUp,
  IDLE,
  type GateStep,
  type TouchGate,
  type TouchPoint,
} from '../domain/touchGate';

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
  // Asked per touch gesture: a finger has no hover, so a building is shown first and placed on
  // confirm, while a path is painted.
  readonly confirms?: () => boolean;
  readonly onPending?: (tile: Tile | null) => void;
}

export interface TileStroke {
  arm(armed: boolean): void;
  refresh(): void;
  confirm(): void;
  dismiss(): void;
  dispose(): void;
}

// Fields only: a clicked palette button keeps focus, and its shortcut must still work.
function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

const pointOf = (event: PointerEvent): TouchPoint => ({
  id: event.pointerId,
  x: event.clientX,
  y: event.clientY,
});

export function createTileStroke(options: TileStrokeOptions): TileStroke {
  const { canvas, camera, ground, paints, onHover, onTile, onCancel, takeLeftButton } = options;
  const onKey = options.onKey ?? (() => {});
  const confirms = options.confirms ?? (() => false);
  const onPending = options.onPending ?? (() => {});

  // Reused so picking does not allocate while the mouse is dragged.
  const inverseViewProjection = new Matrix4();

  let armed = false;
  let painting: Tile | null = null;
  let hovered: Tile | null = null;

  let gate: TouchGate = IDLE;
  const fingers = new Set<number>();
  let pending: Tile | null = null;
  let downTile: Tile | null = null;
  let confirming = false;

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

  // Through hovered, so refresh redraws the ghost waiting to be confirmed.
  const setPending = (tile: Tile | null): void => {
    pending = tile;
    hovered = tile;
    onPending(tile);
  };

  // Bresenham between samples, so a quick drag draws a continuous run, not a dotted one.
  const paintTo = (from: Tile, to: Tile): void => {
    for (const step of tilesBetween(from, to)) onTile(step);
    painting = to;
  };

  const follow = (event: PointerEvent): void => {
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

  const onMouseDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const tile = tileUnder(event);
    if (tile) startStroke(tile, event.pointerId);
    preview(tile);
  };

  const release = (event: PointerEvent): void => {
    painting = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  // A finger leaves no hover behind: once it lifts, only a placement waiting to be confirmed shows.
  const settle = (step: GateStep, event: PointerEvent): void => {
    gate = step.gate;
    if (gate.phase === 'stroke') return;
    release(event);
    if (gate.phase !== 'pending') preview(pending);
  };

  const onTouchDown = (event: PointerEvent): void => {
    fingers.add(event.pointerId);
    settle(gateDown(gate, pointOf(event), fingers.size), event);
    if (gate.phase !== 'pending') return;
    confirming = confirms();
    downTile = tileUnder(event);
    if (confirming) preview(downTile);
  };

  const beginTouchStroke = (event: PointerEvent): void => {
    if (confirming) setPending(null);
    else if (downTile) startStroke(downTile, event.pointerId);
    follow(event);
  };

  const onTouchMove = (event: PointerEvent): void => {
    if (gate.phase === 'stroke' && gate.id === event.pointerId) return follow(event);
    const step = gateMove(gate, pointOf(event));
    gate = step.gate;
    if (step.action === 'begin') beginTouchStroke(event);
  };

  const tap = (): void => {
    if (confirming) setPending(downTile);
    else if (downTile) onTile(downTile);
  };

  const onTouchUp = (event: PointerEvent): void => {
    fingers.delete(event.pointerId);
    const step = gateUp(gate, pointOf(event), fingers.size);
    if (step.action === 'tap') tap();
    // A dragged building stays where the finger let go of it.
    if (step.action === 'end' && confirming) setPending(hovered);
    settle(step, event);
  };

  const onTouchCancel = (event: PointerEvent): void => {
    fingers.delete(event.pointerId);
    settle(gateCancel(gate, fingers.size), event);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!armed) return;
    if (event.pointerType === 'touch') onTouchMove(event);
    else follow(event);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!armed) return;
    if (event.pointerType === 'touch') onTouchDown(event);
    else onMouseDown(event);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && armed) onTouchUp(event);
    else release(event);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && armed) onTouchCancel(event);
    else release(event);
  };

  // On touch, a pointerleave follows every lift, and would take the ghost waiting to be confirmed.
  const onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
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
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerleave', onPointerLeave);
  globalThis.addEventListener('keydown', onKeyDown);

  return {
    arm(next) {
      // The ghost and the canvas flag are shared, so an idle stroke told to stay idle must not
      // hide the ghost another pointer has just drawn.
      if (!next && !armed) return;
      armed = next;
      painting = null;
      gate = IDLE;
      fingers.clear();
      setPending(null);
      onHover(null);
      // A flag rather than a cursor, so the stylesheet owns the pointer art.
      canvas.toggleAttribute('data-armed', next);
      takeLeftButton(next);
    },
    refresh() {
      preview(hovered);
    },
    confirm() {
      const tile = pending;
      if (!armed || !tile) return;
      onTile(tile);
      setPending(null);
      preview(null);
    },
    dismiss() {
      if (!armed) return;
      setPending(null);
      preview(null);
    },
    dispose() {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      globalThis.removeEventListener('keydown', onKeyDown);
      canvas.removeAttribute('data-armed');
      takeLeftButton(false);
    },
  };
}
