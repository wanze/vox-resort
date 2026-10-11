import { netOf, REASONS, type Ledger } from '../../sim/domain/ledger';
import { MODE_LABELS } from '../../welcome/components/modeNames';
import { againstYesterday, REASON_LABELS, signed, toneOf } from './ledgerWords';
import { PanelSummary } from './PanelSummary';
import { Row, Rows, Section } from './ReportRows';

export interface LedgerPanelProps {
  readonly ledger: Ledger | null;
}

// The rating's arrows, so a change reads the same wherever it is shown.
const MARKS = { up: '▲', down: '▼' } as const;

const WAY_WORDS = { up: 'better than yesterday', down: 'worse than yesterday' } as const;

// Yesterday's figure stays in the title, for whoever wants more than which way it went.
function Trend({ today, yesterday }: { readonly today: number; readonly yesterday: number }) {
  const way = againstYesterday(today, yesterday);
  if (way === null) return null;
  return (
    <span className="hud-ledger-trend" data-way={way} title={`Yesterday ${signed(yesterday)}`}>
      <span aria-hidden="true">{MARKS[way]}</span>
      <span className="ui-visually-hidden">{`, ${WAY_WORDS[way]}`}</span>
    </span>
  );
}

function FigureRow({
  label,
  today,
  yesterday,
  total = false,
}: {
  readonly label: string;
  readonly today: number;
  readonly yesterday: number;
  readonly total?: boolean;
}) {
  return (
    <Row label={label} total={total}>
      <dd>
        {signed(today)}
        <Trend today={today} yesterday={yesterday} />
      </dd>
    </Row>
  );
}

export function LedgerPanel({ ledger }: LedgerPanelProps) {
  if (!ledger) return <p className="ui-loading">No books yet.</p>;
  const net = netOf(ledger.today);
  return (
    <div className="hud-report">
      <PanelSummary
        figures={[
          { label: 'Balance', value: ledger.balance.toLocaleString('en-US') },
          { label: 'Today', value: signed(net), tone: toneOf(net) },
        ]}
      />
      <Section title="Today, against yesterday">
        <Rows>
          {REASONS.map((reason) => (
            <FigureRow
              key={reason}
              label={REASON_LABELS[reason]}
              today={ledger.today[reason]}
              yesterday={ledger.yesterday[reason]}
            />
          ))}
          <FigureRow label="Net" today={net} yesterday={netOf(ledger.yesterday)} total />
        </Rows>
      </Section>
      <p className="ui-note">
        {ledger.mode === 'tycoon'
          ? `${MODE_LABELS[ledger.mode]}: everything built is paid for.`
          : `${MODE_LABELS[ledger.mode]}: the books are kept, but the money never runs out.`}
      </p>
    </div>
  );
}
