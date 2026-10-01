// Inset by a pixel, so a stroke along the top or bottom edge is not clipped in half.
const INSET = 1;

const rounded = (value: number): number => Math.round(value * 100) / 100;

export function sparkPath(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = width - 2 * INSET;
  const rise = height - 2 * INSET;
  const yOf = (value: number): number =>
    high === low ? height / 2 : INSET + rise * (1 - (value - low) / (high - low));
  return values
    .map((value, index) => {
      const x = INSET + (span * index) / (values.length - 1);
      return `${index === 0 ? 'M' : 'L'}${rounded(x)} ${rounded(yOf(value))}`;
    })
    .join(' ');
}
