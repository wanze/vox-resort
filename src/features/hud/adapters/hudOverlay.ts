// Written straight to the DOM: re-rendering React every frame would distort the frame
// rate it reports. React still creates the nodes.

export interface FrameUpdate {
  readonly fps: number;
  readonly time: number;
  readonly clock: string;
  readonly activeLights: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly cpu: {
    readonly latestMs: number;
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
  readonly activeLights: Slot<HTMLSpanElement>;
  readonly time: Slot<HTMLInputElement>;
  readonly clock: Slot<HTMLSpanElement>;
  readonly drawn: Slot<HTMLSpanElement>;
  readonly cpu: Slot<HTMLSpanElement>;
  readonly detail: Slot<HTMLSpanElement>;
  readonly shaders: Slot<HTMLSpanElement>;
  readonly inspect: Slot<HTMLSpanElement>;
  readonly onFpsChange: (fps: number) => void;
}

export interface HudOverlay {
  update(frame: FrameUpdate): void;
}

const formatCount = (value: number): string => value.toLocaleString('en-US');

export function createHudOverlay(parts: HudOverlayParts): HudOverlay {
  // Last written values, so an unchanged number costs no DOM write and no React render.
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

  const writeDrawn = (calls: number, tris: number): void => {
    const element = parts.drawn.current;
    if (!element || (calls === drawCalls && tris === triangles)) return;
    drawCalls = calls;
    triangles = tris;
    element.textContent = `${calls.toLocaleString('en-US')} calls, ${tris.toLocaleString('en-US')} triangles`;
  };

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
    // Unless it is being dragged, in which case the clock follows the slider.
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
      writeText(parts.clock, frame.clock);
      writeDrawn(frame.drawCalls, frame.triangles);
      writeCost(frame);
      // Blanked rather than left standing, so a guest's last activity is never read as somebody else's.
      writeText(parts.inspect, frame.inspect ?? '');
    },
  };
}
