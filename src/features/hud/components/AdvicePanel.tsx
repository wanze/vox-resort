import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { isStaffRole, type StaffRole } from '../../sim/domain/staff';
import { StatRow } from './StatRow';
import { roleWord } from './staffWords';

export interface AdvicePanelProps {
  readonly advice: readonly Advice[];
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
  readonly onHire?: (role: StaffRole) => void;
}

const SHOWN = 4;

const NEED_NAMES: { readonly [need: string]: string } = {
  hunger: 'hunger',
  thirst: 'thirst',
  energy: 'rest',
  fun: 'anything to do',
  hygiene: 'getting clean',
  health: 'first aid',
};

const NEED_ERRANDS: { readonly [need: string]: string } = {
  hunger: 'somewhere to eat',
  thirst: 'somewhere to drink',
  energy: 'somewhere to rest',
  fun: 'something to do',
  hygiene: 'somewhere to wash',
  health: 'first aid',
};

const guests = (count: number): string => (count === 1 ? 'guest has' : 'guests have');

// Each line states what happened, never a cause the number does not support.
const SAYS: { readonly [kind in AdviceKind]: (advice: Advice) => string } = {
  closed: () => 'The resort is closed',
  'no-entrance': () => 'Nobody can arrive: there is no entrance',
  'no-reception': () => 'Nobody can check in: no reception is reachable from the entrance',
  'no-beds': ({ count }) => `${count} ${guests(count)} nowhere to sleep`,
  unmade: ({ count }) => `${count} ${count === 1 ? 'bed is' : 'beds are'} waiting to be made up`,
  hurt: ({ count }) => `${count} ${guests(count)} been hurt`,
  'unserved-need': ({ subject, need }) =>
    `Nothing on the plot serves ${NEED_NAMES[need ?? subject] ?? subject}`,
  'full-lines': ({ subject, count }) => `${subject} turned ${count} away at the door today`,
  unreachable: ({ subject }) => `Nobody can reach ${subject}`,
  'short-staffed': ({ subject, count }) =>
    `The plot needs ${count} more ${isStaffRole(subject) ? roleWord(subject, count) : subject}`,
  broken: ({ subject }) => `${subject} has broken down`,
  dirty: ({ subject }) => `${subject} is getting dirty and nobody has got to it`,
  unwatched: ({ subject }) => `Nobody is watching ${subject}`,
  littered: ({ count }) => `Litter is piling up on ${count} tiles`,
  'far-from-home': ({ subject, count, need }) =>
    `${subject} guests walk ${count} tiles for ${NEED_ERRANDS[need ?? ''] ?? 'something they need'}`,
  'no-depot': ({ count }) =>
    `${count} ${roleWord('cleaner', count)} ${count === 1 ? 'fetches' : 'fetch'} supplies from the entrance`,
  unvisited: ({ subject }) => `Nobody visited ${subject} today`,
  'weather-closed': ({ subject, need }) =>
    `The weather shut most of what serves ${NEED_NAMES[need ?? subject] ?? subject}`,
};

const MEANS: { readonly [kind in AdviceKind]: (advice: Advice) => string | null } = {
  closed: () => 'open the gates in the top bar',
  'no-entrance': () => null,
  'no-reception': () => null,
  'no-beds': () => null,
  unmade: () => 'no guest can be given them until a cleaner has been',
  hurt: () => null,
  'unserved-need': ({ count }) => `${count} ${guests(count)} it now`,
  'full-lines': () => 'the line was already full',
  unreachable: ({ count }) => `${count} places standing idle`,
  'short-staffed': () => 'hired by hand, so the roster does not follow the plot',
  broken: ({ count }) =>
    count < 60 ? 'down under an hour' : `down for ${Math.round(count / 60)} h`,
  dirty: ({ count }) => `${count}% clean`,
  unwatched: ({ count }) => `${count} swam there today`,
  // Supported: a guest drops litter only where no bin covered six tiles in a row.
  littered: () => 'no bin within reach',
  'far-from-home': () => 'straight line, not walking distance',
  'no-depot': () => 'a staff house near their work saves the walk',
  unvisited: ({ count }) => `room for ${count}`,
  'weather-closed': ({ count }) => `${count} of them have no roof`,
};

const LABELS: { readonly [kind in AdviceKind]: string } = {
  closed: 'Closed',
  'no-entrance': 'Entrance',
  'no-reception': 'Reception',
  'no-beds': 'Beds',
  unmade: 'Housekeeping',
  hurt: 'Injuries',
  'unserved-need': 'Missing',
  'full-lines': 'Queues',
  unreachable: 'Stranded',
  'short-staffed': 'Staff',
  broken: 'Repairs',
  dirty: 'Upkeep',
  unwatched: 'Lifeguard',
  littered: 'Litter',
  'far-from-home': 'Distance',
  'no-depot': 'Staff house',
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

function HireButton({
  advice,
  onHire,
}: {
  readonly advice: Advice;
  readonly onHire: AdvicePanelProps['onHire'];
}) {
  const role = advice.subject;
  if (advice.kind !== 'short-staffed' || !isStaffRole(role) || !onHire) return null;
  return (
    <button
      type="button"
      className="hud-camera-mode hud-advice-show"
      aria-label={`Hire ${roleWord(role, 2)} up to what the plot needs`}
      onClick={() => onHire(role)}
    >
      Hire
    </button>
  );
}

function AdviceRow({
  advice,
  onShowOnPlot,
  onHire,
}: {
  readonly advice: Advice;
  readonly onShowOnPlot: AdvicePanelProps['onShowOnPlot'];
  readonly onHire: AdvicePanelProps['onHire'];
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
      <HireButton advice={advice} onHire={onHire} />
    </StatRow>
  );
}

export function AdvicePanel({ advice, onShowOnPlot, onHire }: AdvicePanelProps) {
  if (advice.length === 0) {
    return <p className="hud-loading">Nothing needs attention.</p>;
  }
  return (
    <dl className="hud-stats hud-advice">
      {advice.slice(0, SHOWN).map((each) => (
        <AdviceRow key={keyOf(each)} advice={each} onShowOnPlot={onShowOnPlot} onHire={onHire} />
      ))}
    </dl>
  );
}
