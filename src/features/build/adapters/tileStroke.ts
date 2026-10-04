import { Matrix4, type Camera } from 'three/webgpu';
import { levelHeight } from '../../layout/domain/elevation';
import type { Tile } from '../../layout/domain/resortLayout';
import { tilesBetween } from '../domain/buildPlan';
import { pickTile, type PickGround, type PointerPosition } from '../domain/groundPick';
import { grabsAnchor, tileOnScreen } from '../domain/touchAnchor';
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
import type { PlacementGhost } from './placementGhost';

export interface TileStrokeOptions {
  readonly canvas: HTMLCanvasElement;
  // Read afresh per pick: which camera is on screen changes with the mode.
  readonly camera: () => Camera;
  // A left-drag that both moves the camera and works tiles is unusable, so a tool borrows it.
  readonly takeLeftButton: (taken: boolean) => void;
  // Borrowed per touch, only for a finger that lands on the anchor.
  readonly takeFinger: (taken: boolean) => void;
  readonly marker: Pick<PlacementGhost, 'showAnchor'>;
  readonly ground: PickGround;
  readonly paints: () => boolean;
  readonly onHover: (tile: Tile | null) => void;
  // One tile at a time, in order: both tools read ground the stroke itself has just
  // changed, so planning the run up front would give a different result.
  readonly onTile: (tile: Tile) => void;
  readonly onCancel: () => void;
  readonly onKey?: (event: KeyboardEvent) => void;
  readonly placing?: TouchPlacing;
}

export interface TouchPlacing {
  // Asked per touch gesture: a finger has no hover, so a building is shown first and placed on
  // confirm, while a path is painted.
  readonly confirms: () => boolean;
  readonly onPending: (tile: Tile | null) => void;
  // Whether a finger on this tile has hold of the anchor: a building is held by any of its tiles.
  readonly covers: (anchor: Tile, tile: Tile) => boolean;
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

const PAINTS: TouchPlacing = {
  confirms: () => false,
  onPending: () => {},
  covers: (anchor, tile) => anchor.x === tile.x && anchor.z === tile.z,
};

const offsetOf = (from: Tile | null, to: Tile | null): Tile =>
  from && to ? { x: to.x - from.x, z: to.z - from.z } : { x: 0, z: 0 };

const heightOf = (ground: PickGround, tile: Tile): number =>
  levelHeight(ground.levelOf(tile.x, tile.z));

// On touch, one finger moves the camera. A tap paints a tile, or shows a building, and leaves an
// anchor there; only a drag that starts on the anchor works tiles, carrying on from it.
export function createTileStroke(options: TileStrokeOptions): TileStroke {
  const { canvas, camera, ground, paints, onHover, onTile, onCancel, takeLeftButton } = options;
  const { takeFinger, marker } = options;
  const onKey = options.onKey ?? (() => {});
  const { confirms, onPending, covers } = options.placing ?? PAINTS;

  // Reused so picking does not allocate while the mouse is dragged.
  const inverseViewProjection = new Matrix4();
  const viewProjection = new Matrix4();

  let armed = false;
  let painting: Tile | null = null;
  let hovered: Tile | null = null;

  let gate: TouchGate = IDLE;
  const fingers = new Set<number>();
  let pending: Tile | null = null;
  // Where a painting tool's last touch stroke ended.
  let mark: Tile | null = null;
  let downTile: Tile | null = null;
  let confirming = false;
  let grabbing = false;
  let grabOffset: Tile = { x: 0, z: 0 };
  let fingerLent = false;

  const viewport = () => ({
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
  });

  const onCanvas = (event: PointerEvent): PointerPosition => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const viewProjectionNow = (): Matrix4 => {
    const eye = camera();
    eye.updateMatrixWorld();
    return viewProjection.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse);
  };

  const tileUnder = (event: PointerEvent): Tile | null => {
    inverseViewProjection.copy(viewProjectionNow()).invert();
    return pickTile(onCanvas(event), viewport(), inverseViewProjection.elements, undefined, ground);
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

  const lendFinger = (lent: boolean): void => {
    if (lent === fingerLent) return;
    fingerLent = lent;
    takeFinger(lent);
  };

  // What a lifted finger leaves on the map: the building waiting, or where to carry on from.
  const rest = (): void => {
    if (pending || !mark) return preview(pending);
    hovered = null;
    marker.showAnchor(mark, heightOf(ground, mark));
  };

  const settle = (step: GateStep, event: PointerEvent): void => {
    gate = step.gate;
    if (gate.phase === 'stroke') return;
    release(event);
    if (gate.phase === 'idle') lendFinger(false);
    if (gate.phase !== 'pending') rest();
  };

  const grabs = (event: PointerEvent): boolean => {
    const anchor = confirming ? pending : mark;
    if (!anchor) return false;
    const onAnchor = downTile !== null && covers(anchor, downTile);
    const centre = tileOnScreen(
      anchor,
      heightOf(ground, anchor),
      viewport(),
      viewProjectionNow().elements,
    );
    return grabsAnchor(centre, onCanvas(event), onAnchor);
  };

  const pressed = (event: PointerEvent): void => {
    confirming = confirms();
    downTile = tileUnder(event);
    grabbing = grabs(event);
    // Held where it was grabbed, so a building picked up by its far corner does not jump.
    grabOffset = offsetOf(downTile, pending);
    if (grabbing && !confirming) painting = mark;
    lendFinger(grabbing);
  };

  // Ahead of OrbitControls, which reads whether the finger is lent as the touch lands.
  const onTouchDown = (event: PointerEvent): void => {
    if (!armed || event.pointerType !== 'touch') return;
    fingers.add(event.pointerId);
    settle(gateDown(gate, pointOf(event), fingers.size), event);
    if (gate.phase === 'pending') pressed(event);
  };

  const carry = (tile: Tile | null): void => {
    preview(tile && { x: tile.x + grabOffset.x, z: tile.z + grabOffset.z });
  };

  const holds = (event: PointerEvent): boolean =>
    grabbing && gate.phase === 'stroke' && gate.id === event.pointerId;

  const onTouchMove = (event: PointerEvent): void => {
    gate = gateMove(gate, pointOf(event)).gate;
    if (!holds(event)) return;
    if (confirming) carry(tileUnder(event));
    else follow(event);
  };

  const tapPaint = (): void => {
    if (!downTile) return;
    onTile(downTile);
    mark = downTile;
  };

  // A tap on the waiting building itself leaves it where it is.
  const tap = (): void => {
    if (!confirming) tapPaint();
    else if (!grabbing) setPending(downTile);
  };

  const dropped = (): void => {
    if (confirming) setPending(hovered);
    else mark = painting;
  };

  const onTouchUp = (event: PointerEvent): void => {
    fingers.delete(event.pointerId);
    const step = gateUp(gate, pointOf(event), fingers.size);
    if (step.action === 'tap') tap();
    if (step.action === 'end' && grabbing) dropped();
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
    if (armed && event.pointerType !== 'touch') onMouseDown(event);
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
  canvas.addEventListener('pointerdown', onTouchDown, { capture: true });
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
      mark = null;
      grabbing = false;
      lendFinger(false);
      setPending(null);
      onHover(null);
      // A flag rather than a cursor, so the stylesheet owns the pointer art.
      canvas.toggleAttribute('data-armed', next);
      takeLeftButton(next);
    },
    refresh() {
      if (hovered === null && mark) rest();
      else preview(hovered);
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
      canvas.removeEventListener('pointerdown', onTouchDown, { capture: true });
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      globalThis.removeEventListener('keydown', onKeyDown);
      canvas.removeAttribute('data-armed');
      takeLeftButton(false);
      lendFinger(false);
    },
  };
}
