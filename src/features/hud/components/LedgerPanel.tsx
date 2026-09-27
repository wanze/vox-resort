import { netOf, REASONS, type GameMode, type Ledger, type Reason } from '../../sim/domain/ledger';
import { MODE_LABELS } from '../../welcome/components/modeNames';
import { StatRow } from './StatRow';

export interface LedgerPanelProps {
  readonly ledger: Ledger | null;
}

const REASON_LABELS: { readonly [reason in Reason]: string } = {
  build: 'Building',
  demolish: 'Refunds',
  dig: 'Earthworks',
  visit: 'Visits',
  night: 'Stays',
  wages: 'Wages',
  maintenance: 'Maintenance',
};

const MODE_NOTES: { readonly [mode in GameMode]: string } = {
  sandbox: 'funds without limit',
  tycoon: 'everything built is paid for',
};

const signed = (amount: number): string =>
  amount.toLocaleString('en-US', { signDisplay: 'exceptZero' });

export function LedgerPanel({ ledger }: LedgerPanelProps) {
  if (!ledger) return <p className="hud-loading">No books yet.</p>;
  return (
    <dl className="hud-stats hud-figures">
      <StatRow label="Mode" note={MODE_NOTES[ledger.mode]}>
        {MODE_LABELS[ledger.mode]}
      </StatRow>
      <StatRow label="Balance">{ledger.balance.toLocaleString('en-US')}</StatRow>
      {REASONS.map((reason) => (
        <StatRow
          key={reason}
          label={REASON_LABELS[reason]}
          note={`yesterday ${signed(ledger.yesterday[reason])}`}
        >
          {signed(ledger.today[reason])}
        </StatRow>
      ))}
      <StatRow label="Today" note={`yesterday ${signed(netOf(ledger.yesterday))}`}>
        {signed(netOf(ledger.today))}
      </StatRow>
    </dl>
  );
}
