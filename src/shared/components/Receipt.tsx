import type { ReactNode } from 'react';
import type { TillLine } from '../domain/till';

export interface ReceiptProps {
  readonly label: string;
  readonly children: ReactNode;
}

// The shadow sits on a wrapper: the torn edge is a mask, which would cut a shadow on the paper away.
export function Receipt({ label, children }: ReceiptProps) {
  return (
    <div className="ui-receipt">
      <div className="ui-receipt-paper" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function ReceiptLines({ lines }: { readonly lines: readonly TillLine[] }) {
  return (
    <dl className="ui-receipt-lines">
      {lines.map((line) => (
        <div
          key={line.label}
          className="ui-receipt-line"
          data-tone={line.tone}
          data-total={line.total || undefined}
        >
          <dt>
            {line.label}
            {line.note ? <span className="ui-receipt-note">{line.note}</span> : null}
          </dt>
          <dd>{line.amount}</dd>
        </div>
      ))}
    </dl>
  );
}
