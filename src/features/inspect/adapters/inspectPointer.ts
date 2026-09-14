/**
 * The inspector gesture: a click with no tool armed says what is under it.
 *
 * Only the events and the camera live here. Which person a click is on is
 * `domain/pickPerson.ts`, which tile is `build/domain/groundPick.ts`, and what
 * either of those *is* is `domain/selection.ts`.
 *
 * **The inspector does not take the left mouse button.** The three editing tools
 * do, because a left-drag that both orbits the camera and paves a path is
 * unusable. Inspecting is not like that: it happens when no tool is armed, when
 * the left button belongs to the camera, and taking it would cost the camera its
 * drag to serve a click. So this listens instead of capturing: a `pointerdown`
 * followed by a `pointerup` within {@link CLICK_SLOP} pixels and
 * {@link CLICK_MS} milliseconds is a click and selects; anything longer or
 * further was a camera drag and is ignored.
 *
 * A person is tried before the ground, because a person stands on a tile that
 * something else - a path, at least - is almost always standing on too.
 */

import { Matrix4, type Camera } from 'three/webgpu';
import { pickTile, type PickGround } from '../../build/domain/groundPick';
import type { Tile } from '../../layout/domain/resortLayout';
import { pickPerson, type PickablePeople } from '../domain/pickPerson';
import type { InspectTarget } from '../domain/selection';

/**
 * How far the pointer may move between going down and coming up and still be a
 * click, in CSS pixels. A hand does not hold a mouse still; a camera drag goes
 * well past this in its first frame.
 */
const CLICK_SLOP = 4;

/**
 * How long a click may be held, in milliseconds. Longer is somebody pressing to
 * drag who has not moved yet, and letting go should not select anything.
 */
const CLICK_MS = 400;

export interface InspectPointerOptions {
  readonly canvas: HTMLCanvasElement;
  /** Read afresh per pick: which camera is on screen changes with the mode. */
  readonly camera: () => Camera;
  /** Whether the inspector is listening: false while a build tool is armed. */
  readonly armed: () => boolean;
  /** The people to test a click against, and how high to aim on one. */
  readonly people: () => PickablePeople;
  readonly aimHeight: number;
  /** How high the ground is, for the tile pick behind a person pick. */
  readonly ground: PickGround;
  /** What stands on a tile, which the occupancy index names. */
  readonly keyAt: (tile: Tile) => string | undefined;
  /** Selects a person, a placement, or nothing. */
  readonly onSelect: (selected: InspectTarget) => void;
}

export interface InspectPointer {
  dispose(): void;
}

/**
 * Whether a key press was typed into a field rather than aimed at the scene.
 * The rule `tileStroke.ts` keeps for its own Escape, for the same reason.
 */
function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

export function createInspectPointer(options: InspectPointerOptions): InspectPointer {
  const { canvas, camera, armed, people, aimHeight, ground, keyAt, onSelect } = options;

  // Reused across clicks, as the tile stroke reuses its own.
  const viewProjection = new Matrix4();
  const inverseViewProjection = new Matrix4();

  /** Where and when the left button went down, or null when it is not a click in the making. */
  let down: { readonly pointerId: number; x: number; y: number; at: number } | null = null;

  const viewport = () => ({
    width: canvas.clientWidth || globalThis.innerWidth,
    height: canvas.clientHeight || globalThis.innerHeight,
  });

  const pick = (event: PointerEvent): InspectTarget => {
    const eye = camera();
    eye.updateMatrixWorld();
    viewProjection.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse);
    const bounds = canvas.getBoundingClientRect();
    const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const size = viewport();

    const person = pickPerson(pointer, size, viewProjection.elements, people(), aimHeight);
    if (person !== -1) return { person };

    inverseViewProjection.copy(viewProjection).invert();
    const tile = pickTile(pointer, size, inverseViewProjection.elements, undefined, ground);
    const key = tile ? keyAt(tile) : undefined;
    // Empty ground clears the panel, which is what a click off everything means.
    return key === undefined ? null : { key };
  };

  const onPointerDown = (event: PointerEvent): void => {
    down =
      armed() && event.button === 0
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp }
        : null;
  };

  /** Whether a button coming up ends a click, rather than a drag; forgets the press either way. */
  const endsClick = (event: PointerEvent): boolean => {
    const start = down;
    down = null;
    if (!start || event.pointerId !== start.pointerId) return false;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    return moved <= CLICK_SLOP && event.timeStamp - start.at <= CLICK_MS;
  };

  const onPointerUp = (event: PointerEvent): void => {
    // A tool armed between the press and the release has the click now.
    if (endsClick(event) && armed()) onSelect(pick(event));
  };

  const onPointerCancel = (): void => {
    down = null;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // Only while no tool is armed: then Escape is the tool's, and puts it down.
    if (!armed() || inAField(event.target) || event.key !== 'Escape') return;
    onSelect(null);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  globalThis.addEventListener('keydown', onKeyDown);

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      globalThis.removeEventListener('keydown', onKeyDown);
    },
  };
}
