// Written straight to the DOM: re-rendering React every frame would distort the frame
// rate it reports. React still creates the nodes.

export interface FrameUpdate {
  // True on the frames the frame rate is re-measured, which is when the debug readouts move.
  readonly sampled: boolean;
  readonly fps: number;
  readonly time: number;
  readonly clock: string;
  readonly activeLights: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly cpu: {
    readonly meanMs: number;
    readonly worstMs: number;
    readonly renderMs: number;
  };
  readonly gpuMs: number | null;
  readonly detail: {
    readonly near: number;
    readonly mid: number;
    readonly far: number;
    readonly district: number;
    readonly hidden: number;
  };
  readonly people: { readonly drawn: number; readonly total: number };
  readonly shaderBuilds: number;
  readonly inspect: string | null;
}

// A React ref by shape, so this module stays free of React.
interface Slot<T> {
  readonly current: T | null;
}

export interface HudOverlayParts {
  readonly time: Slot<HTMLInputElement>;
  readonly clock: Slot<HTMLSpanElement>;
  readonly inspect: Slot<HTMLSpanElement>;
  readonly fps: Slot<HTMLSpanElement>;
  readonly cpu: Slot<HTMLSpanElement>;
  readonly gpu: Slot<HTMLSpanElement>;
  readonly drawn: Slot<HTMLSpanElement>;
  readonly detail: Slot<HTMLSpanElement>;
  readonly people: Slot<HTMLSpanElement>;
  readonly shaders: Slot<HTMLSpanElement>;
  readonly activeLights: Slot<HTMLSpanElement>;
}

export interface HudOverlay {
  update(frame: FrameUpdate): void;
}

const formatCount = (value: number): string => value.toLocaleString('en-US');

const formatMs = (value: number): string => `${value.toFixed(1)} ms`;

export function createHudOverlay(parts: HudOverlayParts): HudOverlay {
  // Keyed by node, so a window closed and opened again gets its numbers back straight away.
  const written = new WeakMap<HTMLElement, string>();
  const writeText = (slot: Slot<HTMLSpanElement>, text: string): void => {
    const element = slot.current;
    if (!element || written.get(element) === text) return;
    written.set(element, text);
    element.textContent = text;
  };

  const writeDebug = (frame: FrameUpdate): void => {
    writeText(parts.fps, String(frame.fps));
    writeText(
      parts.cpu,
      `${formatMs(frame.cpu.meanMs)} mean · ${Math.round(frame.cpu.worstMs)} ms worst`,
    );
    writeText(
      parts.gpu,
      `${formatMs(frame.cpu.renderMs)} · GPU ${frame.gpuMs === null ? 'n/a' : formatMs(frame.gpuMs)}`,
    );
    writeText(
      parts.drawn,
      `${formatCount(frame.drawCalls)} calls · ${formatCount(frame.triangles)} tris`,
    );
    const { near, mid, far, district, hidden } = frame.detail;
    writeText(
      parts.detail,
      `${formatCount(near)} near · ${formatCount(mid)} mid · ${formatCount(far)} far\n` +
        `${formatCount(district)} district · ${formatCount(hidden)} hidden`,
    );
    writeText(
      parts.people,
      `${formatCount(frame.people.drawn)} of ${formatCount(frame.people.total)}`,
    );
    writeText(parts.shaders, formatCount(frame.shaderBuilds));
    writeText(parts.activeLights, formatCount(frame.activeLights));
  };

  const writeTime = (time: number): void => {
    const element = parts.time.current;
    // Unless it is being dragged, in which case the clock follows the slider.
    if (!element || document.activeElement === element) return;
    element.value = time.toFixed(3);
  };

  return {
    update(frame) {
      if (frame.sampled) writeDebug(frame);
      writeTime(frame.time);
      writeText(parts.clock, frame.clock);
      // Blanked rather than left standing, so a guest's last activity is never read as somebody else's.
      writeText(parts.inspect, frame.inspect ?? '');
    },
  };
}
