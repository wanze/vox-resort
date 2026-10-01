import { starsTrend, type DayReport } from '../../sim/domain/dayReport';
import { netOf, type GameMode } from '../../sim/domain/ledger';
import { signed } from './ledgerWords';

export const trendArrow = (trend: number | null): string =>
  trend === null || trend === 0 ? '' : trend > 0 ? '▲' : '▼';

export const trendWords = (trend: number | null): string =>
  trend === null || trend === 0 ? '' : `${trendArrow(trend)}${Math.abs(trend).toFixed(1)}`;

// Against the report before it, not the newest: an old toast keeps the change it was shown with.
export function trendOn(history: readonly DayReport[], day: number): number | null {
  const at = history.findIndex((report) => report.day === day);
  return at < 0 ? null : starsTrend(history.slice(0, at + 1));
}

// Money only where it is real: a sandbox's books would read as a score that means nothing.
export function daySummary(report: DayReport, trend: number | null, mode: GameMode | null): string {
  const stars = [`${report.rating.stars.toFixed(1)} ★`, trendWords(trend)].filter(Boolean);
  return [
    `Day ${report.day}`,
    mode === 'tycoon' ? signed(netOf(report.money)) : null,
    stars.join(' '),
    `${report.present.toLocaleString('en-US')} guests`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}
