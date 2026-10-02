import type { Advice, AdviceKind } from '../../sim/domain/advice';
import type { News } from '../domain/news';
import { isStaffRole } from '../../sim/domain/staff';
import { roleWord } from './staffWords';

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
  'not-step-free': ({ count }) =>
    `${count} ${count === 1 ? "venue can't" : "venues can't"} be reached by wheelchair`,
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
  'no-beds': () => 'build more lodgings, or they walk all night until they leave',
  unmade: () => 'no guest can be given them until a cleaner has been',
  hurt: () => null,
  'unserved-need': ({ count }) => `${count} ${guests(count)} it now`,
  'full-lines': () => 'the line was already full',
  unreachable: ({ count }) => `${count} places standing idle`,
  'not-step-free': ({ subject }) => `stairs and no ramp on the way to ${subject}`,
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
  'not-step-free': 'Access',
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

export const adviceSays = (advice: Advice): string => SAYS[advice.kind](advice);

export const adviceMeans = (advice: Advice): string | null => MEANS[advice.kind](advice);

export const adviceLabel = (kind: AdviceKind): string => LABELS[kind];

export const newsSays = ({ advice, count }: News): string =>
  count > 1 ? `${adviceSays(advice)}, and ${count - 1} more` : adviceSays(advice);
