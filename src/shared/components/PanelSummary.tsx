import type { ReactNode } from 'react';
import type { Tone } from '../domain/tone';

export interface SummaryFigure {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: Tone | undefined;
  // Beside the figure and smaller, as a change since the day before.
  readonly aside?: string | undefined;
}

// The row every tab may open with: its few key figures, and the help card at the far end.
export function PanelSummary({
  figures,
  help,
}: {
  readonly figures: readonly SummaryFigure[];
  readonly help?: ReactNode;
}) {
  return (
    <div className="ui-summary">
      {figures.map((figure) => (
        <span key={figure.label} className="ui-tag">
          <span className="ui-label">{figure.label}</span>
          <strong data-tone={figure.tone}>{figure.value}</strong>
          {figure.aside ? <span className="ui-summary-aside">{figure.aside}</span> : null}
        </span>
      ))}
      {help}
    </div>
  );
}
