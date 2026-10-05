import type { ThoughtKind } from '../../sim/domain/thoughts';

// Not the advice's need names: those finish "serves ...", these finish "my ...".
const NEED_WORDS: { readonly [need: string]: string } = {
  hunger: 'hunger',
  thirst: 'thirst',
  energy: 'tired legs',
  fun: 'boredom',
  hygiene: 'sandy feet',
  health: 'scrapes',
};

// In a guest's voice, and only what the simulation decided: never a reason it did not weigh.
const SAYS: { readonly [kind in ThoughtKind]: (subject: string | null) => string } = {
  'queue-too-long': (subject) =>
    subject ? `The line at ${subject} was too long` : 'The lines were too long',
  closed: (subject) =>
    subject ? `${subject} was shut when I got there` : 'Everything was shut when I got there',
  'nothing-for': (subject) => `Nothing here for my ${NEED_WORDS[subject ?? ''] ?? 'needs'}`,
  'no-bed': () => 'I had nowhere to sleep',
  filthy: (subject) => (subject ? `${subject} was filthy` : 'Everything was filthy'),
  enjoyed: (subject) => (subject ? `Loved ${subject}` : 'Loved it here'),
  lovely: () => 'What a lovely spot',
  littered: () => 'The paths are covered in litter',
  broken: (subject) => (subject ? `${subject} was broken` : 'Things kept breaking'),
  hurt: (subject) => (subject ? `I got hurt at ${subject}` : 'I got sunburnt'),
  'no-step-free': (subject) => `Stairs everywhere, I could not get to ${subject ?? 'anything'}`,
  'great-show': (subject) => (subject ? `${subject} was great fun` : 'What a show'),
  'called-off': (subject) => (subject ? `${subject} was called off` : 'The show was called off'),
  welcomed: () => 'What a warm welcome',
  fireworks: (subject) => (subject ? `${subject} lit up the night` : 'What a fireworks show'),
};

export const THOUGHT_LABELS: { readonly [kind in ThoughtKind]: string } = {
  'queue-too-long': 'Queues',
  closed: 'Shut',
  'nothing-for': 'Missing',
  'no-bed': 'Beds',
  filthy: 'Upkeep',
  enjoyed: 'Fun',
  lovely: 'Setting',
  littered: 'Litter',
  broken: 'Repairs',
  hurt: 'Injuries',
  'no-step-free': 'Access',
  'great-show': 'Shows',
  'called-off': 'Called off',
  welcomed: 'Welcome',
  fireworks: 'Fireworks',
};

export function thoughtLine(kind: ThoughtKind, subject: string | null): string {
  return SAYS[kind](subject);
}
