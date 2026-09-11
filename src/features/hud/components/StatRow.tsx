import type { ReactNode } from 'react';

export interface StatRowProps {
  readonly label: string;
  readonly children: ReactNode;
  /** The parenthetical that qualifies the number, when there is one. */
  readonly note?: ReactNode;
}

/** One line of the renderer's report: what was counted, and the count. */
export function StatRow({ label, children, note }: StatRowProps) {
  return (
    <div className="hud-stat">
      <dt>{label}</dt>
      <dd>
        {children}
        {note ? <span className="hud-stat-note"> ({note})</span> : null}
      </dd>
    </div>
  );
}
