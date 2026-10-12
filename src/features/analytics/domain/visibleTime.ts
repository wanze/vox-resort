export interface VisibleTime {
  readonly banked: number;
  readonly since: number | null;
}

export const visibleFrom = (now: number, visible: boolean): VisibleTime => ({
  banked: 0,
  since: visible ? now : null,
});

export const shown = (time: VisibleTime, now: number): VisibleTime =>
  time.since === null ? { ...time, since: now } : time;

export const hidden = (time: VisibleTime, now: number): VisibleTime =>
  time.since === null ? time : { banked: time.banked + now - time.since, since: null };

// The time banked so far, and a tally that starts again from nothing.
export function drained(time: VisibleTime): [number, VisibleTime] {
  return [time.banked, { ...time, banked: 0 }];
}
