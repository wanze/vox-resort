import type { ReactNode } from 'react';

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
