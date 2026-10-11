import type { ReactNode } from 'react';
import type { Tone } from '../../../shared/components/tone';

export interface SummaryFigure {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: Tone | undefined;
  // Beside the figure and smaller, as a change since the day before.
  readonly aside?: string | undefined;
}

export function PanelSummary({
  figures,
  help,
}: {
  readonly figures: readonly SummaryFigure[];
  readonly help?: ReactNode;
}) {
  return (
    <div className="hud-summary">
      {figures.map((figure) => (
        <span key={figure.label} className="ui-tag">
          <span className="ui-label">{figure.label}</span>
          <strong data-tone={figure.tone}>{figure.value}</strong>
          {figure.aside ? <span className="hud-figure-aside">{figure.aside}</span> : null}
        </span>
      ))}
      {help}
    </div>
  );
}
