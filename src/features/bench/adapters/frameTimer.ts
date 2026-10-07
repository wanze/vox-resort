export interface FrameTimer {
  start(): number;
  end(name: string, started: number, detail?: number): void;
}

const OFF: FrameTimer = { start: () => 0, end: () => undefined };

// Off outside a bench: a measure a frame would grow the timeline all session.
export function createFrameTimer(on: boolean): FrameTimer {
  if (!on) return OFF;
  return {
    start: () => performance.now(),
    end: (name, started, detail) => {
      performance.measure(name, { start: started, detail });
    },
  };
}
