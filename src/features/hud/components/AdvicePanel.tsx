import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { StatRow } from './StatRow';

export interface AdvicePanelProps {
  readonly advice: readonly Advice[];
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
}

const SHOWN = 4;

const NEED_NAMES: { readonly [need: string]: string } = {
  hunger: 'hunger',
  thirst: 'thirst',
  energy: 'rest',
  fun: 'anything to do',
  hygiene: 'getting clean',
};

const NEED_ERRANDS: { readonly [need: string]: string } = {
  hunger: 'somewhere to eat',
  thirst: 'somewhere to drink',
  energy: 'somewhere to rest',
  fun: 'something to do',
  hygiene: 'somewhere to wash',
};

const guests = (count: number): string => (count === 1 ? 'guest has' : 'guests have');

// Each line states what happened, never a cause the number does not support.
const SAYS: { readonly [kind in AdviceKind]: (advice: Advice) => string } = {
  'no-beds': ({ count }) => `${count} ${guests(count)} nowhere to sleep`,
  'unserved-need': ({ subject, need }) =>
    `Nothing on the plot serves ${NEED_NAMES[need ?? subject] ?? subject}`,
  'full-lines': ({ subject, count }) => `${subject} turned ${count} away at the door today`,
  unreachable: ({ subject }) => `Nobody can reach ${subject}`,
  dirty: ({ subject }) => `${subject} is getting dirty and nobody has got to it`,
  'far-from-home': ({ subject, count, need }) =>
    `${subject} guests walk ${count} tiles for ${NEED_ERRANDS[need ?? ''] ?? 'something they need'}`,
  unvisited: ({ subject }) => `Nobody visited ${subject} today`,
  'weather-closed': ({ subject, need }) =>
    `The weather shut most of what serves ${NEED_NAMES[need ?? subject] ?? subject}`,
};

const MEANS: { readonly [kind in AdviceKind]: (advice: Advice) => string | null } = {
  'no-beds': () => null,
  'unserved-need': ({ count }) => `${count} ${guests(count)} it now`,
  'full-lines': () => 'the line was already full',
  unreachable: ({ count }) => `${count} places standing idle`,
  dirty: ({ count }) => `${count}% clean`,
  'far-from-home': () => 'straight line, not walking distance',
  unvisited: ({ count }) => `room for ${count}`,
  'weather-closed': ({ count }) => `${count} of them have no roof`,
};

const LABELS: { readonly [kind in AdviceKind]: string } = {
  'no-beds': 'Beds',
  'unserved-need': 'Missing',
  'full-lines': 'Queues',
  unreachable: 'Stranded',
  dirty: 'Upkeep',
  'far-from-home': 'Distance',
  unvisited: 'Quiet',
  'weather-closed': 'Weather',
};

function noteOf(advice: Advice): string | null {
  const means = MEANS[advice.kind](advice);
  const where = advice.at ? `tile ${advice.at.tileX}, ${advice.at.tileZ}` : null;
  return [means, where].filter(Boolean).join(' · ') || null;
}

// Unique per building, not per model: two idle Changing Cabins are two rows.
const keyOf = (advice: Advice): string =>
  `${advice.kind}:${advice.subject}:${advice.at ? `${advice.at.tileX},${advice.at.tileZ}` : ''}`;

function AdviceRow({
  advice,
  onShowOnPlot,
}: {
  readonly advice: Advice;
  readonly onShowOnPlot: AdvicePanelProps['onShowOnPlot'];
}) {
  const { at } = advice;
  return (
    <StatRow label={LABELS[advice.kind]} note={noteOf(advice)}>
      {SAYS[advice.kind](advice)}
      {at ? (
        <button
          type="button"
          className="hud-camera-mode hud-advice-show"
          aria-label={`Show ${advice.subject} at tile ${at.tileX}, ${at.tileZ}`}
          onClick={() => onShowOnPlot(at)}
        >
          Show
        </button>
      ) : null}
    </StatRow>
  );
}

export function AdvicePanel({ advice, onShowOnPlot }: AdvicePanelProps) {
  if (advice.length === 0) {
    return <p className="hud-loading">Nothing needs attention.</p>;
  }
  return (
    <dl className="hud-stats hud-advice">
      {advice.slice(0, SHOWN).map((each) => (
        <AdviceRow key={keyOf(each)} advice={each} onShowOnPlot={onShowOnPlot} />
      ))}
    </dl>
  );
}
