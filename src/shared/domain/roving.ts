export function stepCursor(cursor: number, step: number, count: number): number {
  if (count === 0) return 0;
  return (((cursor + step) % count) + count) % count;
}

export type RovingAxis = 'horizontal' | 'vertical' | 'both';

const STEPS: { readonly [axis in RovingAxis]: Readonly<Record<string, number>> } = {
  horizontal: { ArrowLeft: -1, ArrowRight: 1 },
  vertical: { ArrowUp: -1, ArrowDown: 1 },
  both: { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 },
};

// `at` is -1 while focus is on the group's container rather than one of its items.
export function rovingTarget(
  key: string,
  at: number,
  count: number,
  axis: RovingAxis,
): number | null {
  if (count === 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = STEPS[axis][key];
  if (step === undefined) return null;
  if (at < 0) return step > 0 ? 0 : count - 1;
  return stepCursor(at, step, count);
}
