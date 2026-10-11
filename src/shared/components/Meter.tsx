import type { CSSProperties } from 'react';

export interface MeterProps {
  // 0 to 1, where more is better: the fill runs from red through amber to green.
  readonly level: number;
  // Left out beside a figure that already says the level, which a reader would hear twice.
  readonly label?: string;
  readonly small?: boolean;
}

export function Meter({ level, label, small = false }: MeterProps) {
  const percent = Math.round(level * 100);
  const className = small ? 'ui-meter ui-meter--small' : 'ui-meter';
  const fill = (
    <span
      className="ui-meter-fill"
      style={{ width: `${percent}%`, '--level': level } as CSSProperties}
    />
  );
  if (label === undefined) {
    return (
      <span className={className} aria-hidden="true">
        {fill}
      </span>
    );
  }
  return (
    <span
      className={className}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
    >
      {fill}
    </span>
  );
}
