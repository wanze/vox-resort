import { clockWords } from '../../events/domain/week';
import type { RenovationWorks } from '../../sim/domain/condition';
import { canAfford, type Ledger } from '../../sim/domain/ledger';

export interface RenovationControls {
  // Read so the button greys out as the balance falls under its price.
  readonly ledger: Ledger | null;
  renovate(keys: readonly string[]): void;
  cancel(key: string): void;
}

export interface RenovationTarget {
  readonly key: string;
  // Null where it is too good to be worth renovating.
  readonly cost: number | null;
  readonly works: RenovationWorks | null;
  // Guests sleeping there now: a lodging with any is closed first, and renovated once they leave.
  readonly staying: number;
}

const guestsWord = (count: number): string => (count === 1 ? '1 guest' : `${count} guests`);

export function worksWords(works: RenovationWorks): string {
  if (works.kind === 'renovating') return `Renovating until ${clockWords(works.until)}`;
  return `Closed, ${guestsWord(works.staying)} still staying`;
}

// For a row of a list, beside the building's name.
export function worksBrief(works: RenovationWorks): string {
  if (works.kind === 'renovating') return `Until ${clockWords(works.until)}`;
  return `${works.staying} staying`;
}

// Sandbox affords anything, and canAfford is the one place that knows it.
export function unaffordable(ledger: Ledger | null, cost: number): string | undefined {
  if (ledger === null || canAfford(ledger, cost)) return undefined;
  const bank = ledger.balance.toLocaleString('en-US');
  return `Costs ${cost.toLocaleString('en-US')}, and there is ${bank} in the bank`;
}

const closingNote = (staying: number): string | undefined =>
  staying > 0
    ? `No new guests are given beds here; the work starts once the ${guestsWord(staying)} staying have left`
    : undefined;

function RenovateOffer({
  target,
  cost,
  controls,
  className,
  brief,
}: {
  readonly target: RenovationTarget;
  readonly cost: number;
  readonly controls: RenovationControls;
  readonly className: string;
  readonly brief: boolean;
}) {
  const why = unaffordable(controls.ledger, cost);
  return (
    <button
      type="button"
      className={className}
      disabled={why !== undefined}
      title={why ?? closingNote(target.staying)}
      onClick={() => controls.renovate([target.key])}
    >
      {offerLabel(cost, target.staying > 0 && !brief)}
    </button>
  );
}

const offerLabel = (cost: number, closes: boolean): string =>
  `${closes ? 'Close & renovate' : 'Renovate'} · ${cost.toLocaleString('en-US')}`;

// Nothing while the work is under way: the row beside it says until when. Brief, for a list,
// leaves the closing to the button's title.
export function RenovateAction({
  target,
  controls,
  className,
  brief,
}: {
  readonly target: RenovationTarget;
  readonly controls: RenovationControls;
  readonly className: string;
  readonly brief: boolean;
}) {
  const { works, cost } = target;
  if (works === null) {
    if (cost === null) return null;
    const offer = { target, cost, controls, className, brief };
    return <RenovateOffer {...offer} />;
  }
  if (works.kind !== 'closing') return null;
  return <CancelButton target={target} controls={controls} className={className} brief={brief} />;
}

function CancelButton({
  target,
  controls,
  className,
  brief,
}: {
  readonly target: RenovationTarget;
  readonly controls: RenovationControls;
  readonly className: string;
  readonly brief: boolean;
}) {
  return (
    <button type="button" className={className} onClick={() => controls.cancel(target.key)}>
      {brief ? 'Cancel' : 'Cancel renovation'}
    </button>
  );
}
