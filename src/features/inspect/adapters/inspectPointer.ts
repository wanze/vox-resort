import { Matrix4, type Camera } from 'three/webgpu';
import { pickTile, type PickGround } from '../../build/domain/groundPick';
import type { Tile } from '../../layout/domain/resortLayout';
import { pickPerson, type PickablePeople } from '../domain/pickPerson';
import type { InspectTarget } from '../domain/selection';

// Listens instead of capturing the left button, which belongs to the camera drag
// while no tool is armed: only a short, nearly still press counts as a click.
const CLICK_SLOP = 4;

const CLICK_MS = 400;

export interface InspectPointerOptions {
  readonly canvas: HTMLCanvasElement;
  // Read afresh per pick: which camera is on screen changes with the mode.
  readonly camera: () => Camera;
  readonly armed: () => boolean;
  readonly people: () => PickablePeople;
  readonly aimHeight: number;
  readonly ground: PickGround;
  readonly keyAt: (tile: Tile) => string | undefined;
  readonly onSelect: (selected: InspectTarget) => void;
}

export interface InspectPointer {
  dispose(): void;
}

function inAField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select');
}

export function createInspectPointer(options: InspectPointerOptions): InspectPointer {
  const { canvas, camera, armed, people, aimHeight, ground, keyAt, onSelect } = options;

  const viewProjection = new Matrix4();
  const inverseViewProjection = new Matrix4();

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
    return key === undefined ? null : { key };
  };

  const onPointerDown = (event: PointerEvent): void => {
    down =
      armed() && event.button === 0
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp }
        : null;
  };

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
    // While a tool is armed, Escape is the tool's.
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
