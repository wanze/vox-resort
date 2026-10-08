import type { Camera, Vector3 } from 'three/webgpu';
import {
  heldRig,
  stepRig,
  type RigState,
  type TargetPose,
  type Vec3,
  type ViewMode,
} from '../domain/followRig';
import { dragged, relaxed, STILL_GLANCE, turnedTo, zoomed, type Glance } from '../domain/glance';

// A notch of a mouse wheel is about 100; a trackpad pinch sends many small ones.
const ZOOM_PER_WHEEL = 0.001;

export interface FollowCameraOptions {
  readonly canvas: HTMLCanvasElement;
  // Read afresh: the scene swaps cameras with the mode.
  readonly camera: () => Camera;
  readonly controls: { enabled: boolean; readonly target: Vector3 };
}

// The share of the line from the look point to the free camera that is clear.
export type ReachOf = (look: Vec3, camera: Vec3) => number;

export interface FollowCamera {
  begin(): void;
  advance(pose: TargetPose, view: ViewMode, dt: number, reachOf: ReachOf | null): void;
  // Stands the camera still, turning it to `look`; false when there is no camera yet to hold.
  hold(look: Vec3 | null, dt: number): boolean;
  position(): Vec3 | null;
  // Keeps the rig and the look-around, so resume carries on from where the camera then is.
  suspend(): void;
  resume(): void;
  viewChanged(view: ViewMode): void;
  // Answers where the target stood, null if it was never placed.
  end(): Vec3 | null;
}

interface Drag {
  readonly pointers: Map<number, { x: number; y: number }>;
  spread: number | null;
}

const spreadOf = (pointers: Map<number, { x: number; y: number }>): number | null => {
  if (pointers.size !== 2) return null;
  const [a, b] = [...pointers.values()];
  return Math.hypot(a!.x - b!.x, a!.y - b!.y);
};

// Takes the camera over from the controls, as the welcome drift does: they stay disabled and are
// never updated while it runs, since their update would clamp the pitch to above the horizon.
export function createFollowCamera(options: FollowCameraOptions): FollowCamera {
  const { canvas, controls } = options;
  let rig: RigState | null = null;
  let glance: Glance = STILL_GLANCE;
  let view: ViewMode = 'third';
  let listening = false;
  const drag: Drag = { pointers: new Map(), spread: null };

  // Never stops propagation, so the inspect pointer still tells a click from a drag.
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag.spread = spreadOf(drag.pointers);
    canvas.setPointerCapture?.(event.pointerId);
  };

  const pinched = (): void => {
    const spread = spreadOf(drag.pointers);
    if (spread && drag.spread) glance = zoomed(glance, drag.spread / spread);
    drag.spread = spread;
  };

  const onPointerMove = (event: PointerEvent): void => {
    const last = drag.pointers.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (drag.pointers.size === 1) glance = dragged(glance, dx, dy, view);
    else pinched();
  };

  const onPointerUp = (event: PointerEvent): void => {
    drag.pointers.delete(event.pointerId);
    drag.spread = spreadOf(drag.pointers);
  };

  // Not passive: a trackpad pinch arrives as a wheel with Ctrl held, and would zoom the page.
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    glance = zoomed(glance, Math.exp(event.deltaY * ZOOM_PER_WHEEL));
  };

  const listen = (on: boolean): void => {
    if (on === listening) return;
    listening = on;
    drag.pointers.clear();
    drag.spread = null;
    if (on) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      return;
    }
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  };

  const place = (state: RigState): void => {
    const camera = options.camera();
    camera.position.set(state.camera.x, state.camera.y, state.camera.z);
    camera.lookAt(state.look.x, state.look.y, state.look.z);
    controls.target.set(state.look.x, state.look.y, state.look.z);
  };

  return {
    begin() {
      rig = null;
      glance = STILL_GLANCE;
      controls.enabled = false;
      listen(true);
    },
    advance(pose, next, dt, reachOf) {
      view = next;
      glance = relaxed(glance, dt);
      const reach = rig && reachOf && view === 'third' ? reachOf(rig.look, rig.free) : 1;
      rig = stepRig(rig, pose, view, glance, reach, dt);
      place(rig);
    },
    hold(look, dt) {
      if (!rig) return false;
      glance = relaxed(glance, dt);
      rig = heldRig(rig, look, dt);
      place(rig);
      return true;
    },
    position: () => rig?.camera ?? null,
    suspend() {
      listen(false);
    },
    resume() {
      controls.enabled = false;
      listen(true);
      if (!rig) return;
      const { position } = options.camera();
      const now = { x: position.x, y: position.y, z: position.z };
      rig = { ...rig, free: now, camera: now, reach: 1 };
    },
    viewChanged(next) {
      view = next;
      glance = turnedTo({ ...glance, yaw: 0 }, next);
    },
    end() {
      listen(false);
      const anchor = rig?.anchor ?? null;
      rig = null;
      return anchor;
    },
  };
}
