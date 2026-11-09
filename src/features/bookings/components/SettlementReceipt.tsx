import { Receipt, ReceiptLines } from '../../../shared/components/Receipt';
import { shownDay } from '../../../shared/domain/dayNumber';
import type { Settlement } from '../domain/bookings';
import { settlementLine } from '../domain/bookingWords';
import { operatorNamed } from '../domain/operators';
import { settlementReceipt } from '../domain/settlementReceipt';
import { OperatorLogo } from './OperatorLogo';

export function SettlementReceipt({ settlement }: { readonly settlement: Settlement }) {
  const listed = operatorNamed(settlement.operator);
  return (
    <Receipt label={settlementLine(settlement)}>
      <header className="ui-receipt-head">
        <OperatorLogo operator={settlement.operator} />
        <strong>{settlement.operator}</strong>
        <span>Settled on day {shownDay(settlement.day)}</span>
      </header>
      <ReceiptLines lines={settlementReceipt(settlement)} />
      <footer className="ui-receipt-foot">
        <span>{listed ? listed.motto : 'Thank you for travelling with us'}</span>
        <span className="ui-receipt-barcode" aria-hidden="true" />
      </footer>
    </Receipt>
  );
}
