import { sparkPath } from '../domain/sparkline';

export interface SparklineProps {
  readonly label: string;
  readonly values: readonly number[];
  readonly format: (value: number) => string;
}

const WIDTH = 120;
const HEIGHT = 24;

// The latest value is left to the caller, which lines it up with the other figures.
export function Sparkline({ label, values, format }: SparklineProps) {
  const first = values[0];
  const last = values.at(-1);
  const said =
    first === undefined || last === undefined
      ? `${label}: no days yet`
      : `${label}: from ${format(first)} to ${format(last)}`;
  return (
    <svg
      className="hud-sparkline"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={said}
    >
      <path d={sparkPath(values, WIDTH, HEIGHT)} fill="none" stroke="currentColor" />
    </svg>
  );
}
