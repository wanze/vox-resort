/**
 * The parts of the HUD that are written straight to the DOM, once a frame.
 *
 * Re-rendering React sixty times a second to move a number would distort the
 * very frame rate that number reports, so the lamp count and the time slider
 * are written here, on the nodes themselves. React still owns creating those
 * nodes; this only writes to them.
 *
 * It lives in `adapters/` because that is what it is — DOM I/O on the hot path —
 * and keeping it out of the component leaves `App` with state and effects, which
 * is all a component should have to explain.
 */

/** What the render loop reports at the end of every frame. */
export interface FrameUpdate {
  readonly fps: number;
  /** Normalised time of day, 0..1. */
  readonly time: number;
  /**
   * The day and the hour, already formatted: formatting it per frame in a
   * component is exactly what this module exists to avoid.
   */
  readonly clock: string;
  /** Lamps contributing to this frame; all of them after dark, none by day. */
  readonly activeLights: number;
  /** Draw calls the renderer actually submitted, after culling and the level of detail. */
  readonly drawCalls: number;
  /** Triangles it actually submitted. */
  readonly triangles: number;
  /**
   * What the main thread spent on this frame and the worst frame of the last
   * second, in milliseconds: stepping everything, choosing the detail and
   * handing the frame to the renderer. See `hud/domain/frameCost.ts`.
   */
  readonly cpu: {
    readonly latestMs: number;
    readonly worstMs: number;
    /** Of `latestMs`, what handing the frame to the renderer took. */
    readonly renderMs: number;
  };
  /**
   * What the GPU spent on the last frame it has reported, from its own timestamp
   * queries, or null where the backend cannot say.
   */
  readonly gpuMs: number | null;
  /** Instanced buckets drawn at each level, and left out as too small; see `levelOfDetail.ts`. */
  readonly detail: {
    readonly near: number;
    readonly mid: number;
    readonly far: number;
    readonly district: number;
    readonly hidden: number;
  };
  /** People drawn this frame, of everybody walking. */
  readonly people: { readonly drawn: number; readonly total: number };
  /** Shaders the renderer has built so far; one that climbs while moving is a stall. */
  readonly shaderBuilds: number;
}

/**
 * A React ref, structurally. Taking the shape rather than the type keeps this
 * module free of React while still accepting the refs the HUD hands it.
 */
interface Slot<T> {
  readonly current: T | null;
}

export interface HudOverlayParts {
  readonly activeLights: Slot<HTMLSpanElement>;
  readonly time: Slot<HTMLInputElement>;
  /** The day and the hour. */
  readonly clock: Slot<HTMLSpanElement>;
  /** What the last frame actually drew. */
  readonly drawn: Slot<HTMLSpanElement>;
  /** What the last frame cost the main thread. */
  readonly cpu: Slot<HTMLSpanElement>;
  /** How the level of detail split the buckets, and the people drawn. */
  readonly detail: Slot<HTMLSpanElement>;
  /** Shaders built so far. */
  readonly shaders: Slot<HTMLSpanElement>;
  /** Called only when the displayed frame rate actually changes. */
  readonly onFpsChange: (fps: number) => void;
}

export interface HudOverlay {
  /** Writes one frame's worth of HUD state. */
  update(frame: FrameUpdate): void;
}

const formatCount = (value: number): string => value.toLocaleString('en-US');

export function createHudOverlay(parts: HudOverlayParts): HudOverlay {
  // Last written values, so an unchanged number costs no DOM write and an
  // unchanged frame rate costs no React render.
  let fps = -1;
  let activeLights = -1;

  const writeLights = (count: number): void => {
    const element = parts.activeLights.current;
    if (count === activeLights || !element) return;
    activeLights = count;
    element.textContent = String(count);
  };

  let drawCalls = -1;
  let triangles = -1;

  /**
   * The draw calls and triangles of the frame just drawn. Only while the node is
   * on screen, and only when either changed: a still camera writes nothing.
   */
  const writeDrawn = (calls: number, tris: number): void => {
    const element = parts.drawn.current;
    if (!element || (calls === drawCalls && tris === triangles)) return;
    drawCalls = calls;
    triangles = tris;
    element.textContent = `${calls.toLocaleString('en-US')} calls, ${tris.toLocaleString('en-US')} triangles`;
  };

  /**
   * Writes a node's text only when it changed: the three below are written every
   * frame the Details panel is open, and most frames change none of them.
   */
  const written = new WeakMap<HTMLElement, string>();
  const writeText = (slot: Slot<HTMLSpanElement>, text: string): void => {
    const element = slot.current;
    if (!element || written.get(element) === text) return;
    written.set(element, text);
    element.textContent = text;
  };

  const writeCost = (frame: FrameUpdate): void => {
    writeText(
      parts.cpu,
      `${frame.cpu.latestMs.toFixed(1)} ms (render ${frame.cpu.renderMs.toFixed(1)}), ` +
        `worst ${Math.round(frame.cpu.worstMs)} ms in the last second; ` +
        `GPU ${frame.gpuMs === null ? 'n/a' : `${frame.gpuMs.toFixed(1)} ms`}`,
    );
    const { near, mid, far, district, hidden } = frame.detail;
    writeText(
      parts.detail,
      `${formatCount(near)} near, ${formatCount(mid)} mid, ${formatCount(far)} far, ` +
        `${formatCount(district)} district, ${formatCount(hidden)} hidden; ` +
        `${formatCount(frame.people.drawn)} of ${formatCount(frame.people.total)} people`,
    );
    writeText(parts.shaders, formatCount(frame.shaderBuilds));
  };

  const writeTime = (time: number): void => {
    const element = parts.time.current;
    // The slider follows the clock while the cycle runs, unless it is being
    // dragged — in which case the clock is following the slider.
    if (!element || document.activeElement === element) return;
    element.value = time.toFixed(3);
  };

  return {
    update(frame) {
      if (frame.fps !== fps) {
        fps = frame.fps;
        parts.onFpsChange(frame.fps);
      }
      writeLights(frame.activeLights);
      writeTime(frame.time);
      // Changes once a simulated minute at most, so most frames write nothing.
      writeText(parts.clock, frame.clock);
      writeDrawn(frame.drawCalls, frame.triangles);
      writeCost(frame);
    },
  };
}
