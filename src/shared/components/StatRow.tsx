import type { ReactNode } from 'react';
import { Meter } from './Meter';

export interface StatRowProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly note?: ReactNode;
}

export function StatRow({ label, children, note }: StatRowProps) {
  return (
    <div className="ui-stat">
      <dt>{label}</dt>
      <dd>
        {children}
        {note ? <span className="ui-stat-note"> ({note})</span> : null}
      </dd>
    </div>
  );
}

export const percentOf = (level: number): string => `${Math.round(level * 100)}%`;

// Every 0-to-1 level reads the same way: a meter, then its figure and an optional word.
export function LevelRow({
  label,
  level,
  word,
}: {
  readonly label: string;
  readonly level: number;
  readonly word?: string;
}) {
  return (
    <StatRow label={label}>
      <span className="ui-stat-meter">
        <Meter level={level} />
        <span>{word ? `${word} · ${percentOf(level)}` : percentOf(level)}</span>
      </span>
    </StatRow>
  );
}
