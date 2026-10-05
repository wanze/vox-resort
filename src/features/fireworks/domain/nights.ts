import { occurrencesOn, type Occurrence, type Programme } from '../../events/domain/programme';
import { HISTORY_DAYS, type DayReport } from '../../sim/domain/dayReport';

export function isFireworksNight(programme: Programme, day: number): boolean {
  return occurrencesOn(programme, day).some((occurrence) => occurrence.kind === 'fireworks');
}

// Two full weeks of reports with none held, and none coming.
export function fireworksDrought(
  history: readonly DayReport[],
  upcoming: readonly Occurrence[],
): boolean {
  return (
    history.length >= HISTORY_DAYS &&
    history.every((report) => (report.events?.fireworks ?? 0) === 0) &&
    !upcoming.some((occurrence) => occurrence.kind === 'fireworks')
  );
}
