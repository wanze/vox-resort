import { netOf, REASONS, type Ledger } from '../../sim/domain/ledger';
import { MODE_LABELS } from '../../welcome/components/modeNames';
import { againstYesterday, REASON_LABELS, signed } from './ledgerWords';
import { StatRow } from './StatRow';

export interface LedgerPanelProps {
  readonly ledger: Ledger | null;
}

const MARKS = { up: '+', down: '−' } as const;

// Yesterday's figure stays in the title, for whoever wants more than which way it went.
function Trend({ today, yesterday }: { readonly today: number; readonly yesterday: number }) {
  const way = againstYesterday(today, yesterday);
  if (way === null) return null;
  return (
    <span className="hud-ledger-trend" data-way={way} title={`Yesterday ${signed(yesterday)}`}>
      {MARKS[way]}
    </span>
  );
}

function Figure({ today, yesterday }: { readonly today: number; readonly yesterday: number }) {
  return (
    <>
      {signed(today)}
      <Trend today={today} yesterday={yesterday} />
    </>
  );
}

export function LedgerPanel({ ledger }: LedgerPanelProps) {
  if (!ledger) return <p className="hud-loading">No books yet.</p>;
  return (
    <dl className="hud-stats hud-figures">
      <StatRow
        label="Mode"
        note={ledger.mode === 'tycoon' ? 'everything built is paid for' : undefined}
      >
        {MODE_LABELS[ledger.mode]}
      </StatRow>
      <StatRow label="Balance">{ledger.balance.toLocaleString('en-US')}</StatRow>
      {REASONS.map((reason) => (
        <StatRow key={reason} label={REASON_LABELS[reason]}>
          <Figure today={ledger.today[reason]} yesterday={ledger.yesterday[reason]} />
        </StatRow>
      ))}
      <StatRow label="Today">
        <Figure today={netOf(ledger.today)} yesterday={netOf(ledger.yesterday)} />
      </StatRow>
    </dl>
  );
}
