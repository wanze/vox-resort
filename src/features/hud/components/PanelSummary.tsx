import type { ReactNode } from 'react';
import type { Tone } from './SettingRows';

export interface SummaryFigure {
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone | undefined;
}

export function PanelSummary({
  figures,
  help,
}: {
  readonly figures: readonly SummaryFigure[];
  readonly help: ReactNode;
}) {
  return (
    <div className="hud-summary">
      {figures.map((figure) => (
        <span key={figure.label} className="hud-summary-figure">
          <span className="ui-label">{figure.label}</span>
          <strong data-tone={figure.tone}>{figure.value}</strong>
        </span>
      ))}
      {help}
    </div>
  );
}
