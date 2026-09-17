import type { Advice, AdviceKind } from '../../sim/domain/advice';
import { StatRow } from './StatRow';

export interface AdvicePanelProps {
  /** What the plot is getting wrong, loudest first; see `sim/domain/advice.ts`. */
  readonly advice: readonly Advice[];
  /** Pans the camera to the building a line is about; see `Showcase.lookAtTile`. */
  readonly onShowOnPlot: (at: { readonly tileX: number; readonly tileZ: number }) => void;
}

/**
 * How many lines are worth reading at once.
 *
 * The list is every observation the six rules made, which on a big plot is
 * dozens of them. A panel that showed all of them would be a log rather than
 * advice: the point is the next thing to do, not an audit.
 */
const SHOWN = 4;

/** What a need is called when the line is about the need itself. */
const NEED_NAMES: { readonly [need: string]: string } = {
  hunger: 'hunger',
  thirst: 'thirst',
  energy: 'rest',
  fun: 'anything to do',
  hygiene: 'getting clean',
};

/**
 * What a need is called when the line is about the walk to it.
 *
 * A second map rather than a clause bolted onto {@link NEED_NAMES}: "walks 76
 * tiles for anything to do" and "nothing on the plot serves anything to do" are
 * the same fact in two grammars, and one map cannot be both without reading as
 * neither.
 */
const NEED_ERRANDS: { readonly [need: string]: string } = {
  hunger: 'somewhere to eat',
  thirst: 'somewhere to drink',
  energy: 'somewhere to rest',
  fun: 'something to do',
  hygiene: 'somewhere to wash',
};

const guests = (count: number): string => (count === 1 ? 'guest has' : 'guests have');

/**
 * The wording, which lives here rather than in the domain.
 *
 * `InspectPanel.tsx`'s reason: a phrase should be changeable without editing a
 * rule and re-reading its test. Every line carries the number that produced it,
 * and **none of them claims a cause the number does not support** - "the Bakery
 * is too small" is a guess; "the Bakery turned 41 guests away today" is what
 * happened, and the player is the one who decides what to do about it.
 */
const SAYS: { readonly [kind in AdviceKind]: (advice: Advice) => string } = {
  'no-beds': ({ count }) => `${count} ${guests(count)} nowhere to sleep`,
  'unserved-need': ({ subject, need }) =>
    `Nothing on the plot serves ${NEED_NAMES[need ?? subject] ?? subject}`,
  'full-lines': ({ subject, count }) => `${subject} turned ${count} away at the door today`,
  unreachable: ({ subject }) => `Nobody can reach ${subject}`,
  dirty: ({ subject }) => `${subject} is getting dirty and nobody has got to it`,
  // The need, not just the distance: "walks 76 tiles for something they need"
  // names a number and no errand, which is nothing the player can build.
  'far-from-home': ({ subject, count, need }) =>
    `${subject} guests walk ${count} tiles for ${NEED_ERRANDS[need ?? ''] ?? 'something they need'}`,
  unvisited: ({ subject }) => `Nobody visited ${subject} today`,
  'weather-closed': ({ subject, need }) =>
    `The weather shut most of what serves ${NEED_NAMES[need ?? subject] ?? subject}`,
};

/** What the number on a line means, where the line does not already say. */
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

/** What a line is labelled with, so the rows read as a list rather than a table. */
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

/**
 * Which one of them, and what its number means.
 *
 * A plot stands nine Changing Cabins, so a line naming only the model is a line
 * the player cannot act on and cannot tell from the one above it. The tile is
 * how `InspectPanel.tsx` already titles a building - `Bakery, tile 12, 7` - so
 * it is vocabulary the HUD has taught, and it points somewhere to go and look.
 */
function noteOf(advice: Advice): string | null {
  const means = MEANS[advice.kind](advice);
  const where = advice.at ? `tile ${advice.at.tileX}, ${advice.at.tileZ}` : null;
  return [means, where].filter(Boolean).join(' · ') || null;
}

/** Unique per building, not per model: two idle Changing Cabins are two rows. */
const keyOf = (advice: Advice): string =>
  `${advice.kind}:${advice.subject}:${advice.at ? `${advice.at.tileX},${advice.at.tileZ}` : ''}`;

/**
 * One line, and the way to go and look at what it is about.
 *
 * The tile in the note says where; this is what saves the player finding it.
 * Nothing at all for the lines about the whole plot - "14 guests have nowhere
 * to sleep" is about no one building, and a button that panned somewhere
 * arbitrary would be worse than none.
 */
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

/**
 * What the resort is getting wrong, in order.
 *
 * Presentational only: everything on it was worked out once a simulated day and
 * arrives as one prop, so the panel re-renders about as often as the sun sets.
 *
 * An empty list is the good answer and reads as one. A blank panel would read
 * as a panel that had not loaded.
 */
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
