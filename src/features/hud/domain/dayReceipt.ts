import { percent, signed, whole, type TillLine } from '../../../shared/domain/till';
import type { DayReport } from '../../sim/domain/dayReport';
import { netOf, REASONS, type GameMode } from '../../sim/domain/ledger';
import { REASON_LABELS, toneOf } from './ledgerWords';

export interface DayReceipt {
  readonly guests: readonly TillLine[];
  // Null in a sandbox, whose books would read as a score that means nothing.
  readonly money: readonly TillLine[] | null;
  readonly mood: TillLine;
}

function guestLines(report: DayReport, welcomed: string | null): readonly TillLine[] {
  const lines: TillLine[] = [
    { label: 'Guests', amount: whole(report.present) },
    { label: 'Arrived', amount: whole(report.arrived) },
  ];
  if (report.turnedAway) {
    lines.push({ label: 'Turned away', amount: whole(report.turnedAway), tone: 'bad' });
  }
  if (welcomed !== null) {
    lines.push({ label: 'Welcomed', note: welcomed, amount: whole(report.welcome?.welcomed ?? 0) });
  }
  lines.push(
    { label: 'Checked out', amount: whole(report.left) },
    { label: 'Beds', amount: `${whole(report.beds.taken)} / ${whole(report.beds.total)}` },
    {
      label: 'Reviews',
      amount: whole(report.reviews),
      ...(report.meanReview === null
        ? {}
        : { note: `${report.meanReview.toFixed(1)} ★ on average` }),
    },
  );
  return lines;
}

function moneyLine(label: string, amount: number, total = false): TillLine {
  const tone = toneOf(amount);
  return {
    label,
    amount: signed(amount),
    ...(total ? { total } : {}),
    ...(tone ? { tone } : {}),
  };
}

// Only the reasons that moved money: a till prints what was rung up, not every key on it.
function moneyLines(report: DayReport): readonly TillLine[] {
  return [
    ...REASONS.filter((reason) => report.money[reason] !== 0).map((reason) =>
      moneyLine(REASON_LABELS[reason], report.money[reason]),
    ),
    moneyLine('Net', netOf(report.money), true),
    { label: 'Balance', amount: whole(report.balance) },
  ];
}

export function dayReceipt(
  report: DayReport,
  mode: GameMode | null,
  welcomed: string | null,
): DayReceipt {
  return {
    guests: guestLines(report, welcomed),
    money: mode === 'tycoon' ? moneyLines(report) : null,
    mood: { label: 'Mood', amount: percent(report.rating.happiness) },
  };
}
