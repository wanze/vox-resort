import type { ReactNode } from 'react';

export interface StatRowProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly note?: ReactNode;
}

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
