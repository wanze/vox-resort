import { useMemo } from 'react';
import { PixelPicture } from '../../../shared/components/PixelIcon';
import { Receipt, ReceiptLines } from '../../../shared/components/Receipt';
import { pixelArt } from '../../../shared/domain/pixelArt';
import { shownDay } from '../../../shared/domain/dayNumber';
import { welcomeWords } from '../../events/components/eventWords';
import type { DayReport } from '../../sim/domain/dayReport';
import type { GameMode } from '../../sim/domain/ledger';
import { dayReceipt } from '../domain/dayReceipt';
import { thermometerRows } from '../domain/thermometer';
import { trendWords } from './dayWords';

export interface DayReceiptProps {
  readonly report: DayReport;
  readonly trend: number | null;
  readonly mode: GameMode | null;
  readonly resortName: string | null;
}

function Mood({ level, amount }: { readonly level: number; readonly amount: string }) {
  const art = useMemo(() => pixelArt(thermometerRows(level)), [level]);
  return (
    <span className="hud-receipt-mood">
      <PixelPicture art={art} scale={2} />
      <span>
        Mood <strong>{amount}</strong>
      </span>
    </span>
  );
}

export function DayReceipt({ report, trend, mode, resortName }: DayReceiptProps) {
  const receipt = dayReceipt(report, mode, welcomeWords(report));
  const stars = [`${report.rating.stars.toFixed(1)} ★`, trendWords(trend)].filter(Boolean);
  return (
    <Receipt label={`Day ${shownDay(report.day)} report`}>
      <header className="ui-receipt-head">
        <strong>{resortName ?? 'Day report'}</strong>
        <span>
          Day {shownDay(report.day)} · {stars.join(' ')}
        </span>
      </header>
      <ReceiptLines lines={receipt.guests} />
      {receipt.money ? <ReceiptLines lines={receipt.money} /> : null}
      <footer className="ui-receipt-foot">
        <Mood level={report.rating.happiness} amount={receipt.mood.amount} />
        <span className="ui-receipt-barcode" aria-hidden="true" />
      </footer>
    </Receipt>
  );
}
