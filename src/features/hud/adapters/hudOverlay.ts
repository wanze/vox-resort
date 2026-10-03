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
  // The same object every frame: spots is [x px, y px, visible 0|1] per marker, up to count.
  readonly markers: { readonly count: number; readonly spots: Float32Array };
  // As markers, one slot per member of staff; inside is 1 for a pin over a roof.
  readonly staff: {
    readonly count: number;
    readonly spots: Float32Array;
    readonly inside: Uint8Array;
    readonly titles: readonly string[];
  };
  // As markers, one per venue sign; count is 0 while zoomed out or turned off.
  readonly signs: { readonly count: number; readonly spots: Float32Array };
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
  // One per marker, in the order the showcase was given their tiles.
  readonly markers: Slot<readonly (HTMLElement | null)[]>;
  // One per member of staff, in staff order.
  readonly staffPins: Slot<readonly (HTMLButtonElement | null)[]>;
  // One per sign, in the order the showcase placed their anchors.
  readonly signs: Slot<readonly (HTMLElement | null)[]>;
}

export interface HudOverlay {
  update(frame: FrameUpdate): void;
}

const formatCount = (value: number): string => value.toLocaleString('en-US');

const pixelScale = (): number => globalThis.devicePixelRatio || 1;

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

  // In whole device pixels: CSS pixels step 2 at a time on a Retina screen, which reads as a
  // shake while the camera's damping glides, and anything finer blurs the pixel icons.
  const placed = new WeakMap<HTMLElement, number>();
  const placeMarker = (button: HTMLElement, x: number, y: number, scale: number): void => {
    const packed = x * 65536 + y;
    if (placed.get(button) === packed) return;
    placed.set(button, packed);
    button.style.transform = `translate(${x / scale}px, ${y / scale}px)`;
  };

  const showMarker = (
    button: HTMLElement,
    index: number,
    { count, spots }: FrameUpdate['markers'],
    scale: number,
  ): void => {
    const visible = index < count && spots[index * 3 + 2] === 1;
    if (button.hidden === visible) button.hidden = !visible;
    if (visible) {
      const x = Math.round(spots[index * 3]! * scale);
      placeMarker(button, x, Math.round(spots[index * 3 + 1]! * scale), scale);
    }
  };

  const writeMarkers = (
    slot: Slot<readonly (HTMLElement | null)[]>,
    markers: FrameUpdate['markers'],
  ): void => {
    const buttons = slot.current ?? [];
    const scale = pixelScale();
    for (let index = 0; index < buttons.length; index++) {
      const button = buttons[index];
      if (button) showMarker(button, index, markers, scale);
    }
  };

  const titled = new WeakMap<HTMLElement, string>();
  const describePin = (button: HTMLButtonElement, inside: boolean, title: string): void => {
    if (button.hasAttribute('data-inside') !== inside)
      button.toggleAttribute('data-inside', inside);
    if (title === '' || titled.get(button) === title) return;
    titled.set(button, title);
    button.title = title;
    button.setAttribute('aria-label', title);
  };

  const writePin = (
    button: HTMLButtonElement,
    index: number,
    pins: FrameUpdate['staff'],
    scale: number,
  ): void => {
    showMarker(button, index, pins, scale);
    if (!button.hidden) describePin(button, pins.inside[index] === 1, pins.titles[index] ?? '');
  };

  const writeStaffPins = (pins: FrameUpdate['staff']): void => {
    const buttons = parts.staffPins.current ?? [];
    const scale = pixelScale();
    for (let index = 0; index < buttons.length; index++) {
      const button = buttons[index];
      if (button) writePin(button, index, pins, scale);
    }
  };

  return {
    update(frame) {
      writeMarkers(parts.signs, frame.signs);
      writeMarkers(parts.markers, frame.markers);
      writeStaffPins(frame.staff);
      if (frame.sampled) writeDebug(frame);
      writeTime(frame.time);
      writeText(parts.clock, frame.clock);
      // Blanked rather than left standing, so a guest's last activity is never read as somebody else's.
      writeText(parts.inspect, frame.inspect ?? '');
    },
  };
}
