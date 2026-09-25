import type { ThoughtKind } from '../../sim/domain/thoughts';

// Not AdvicePanel's need names: those finish "serves ...", these finish "my ...".
const NEED_WORDS: { readonly [need: string]: string } = {
  hunger: 'hunger',
  thirst: 'thirst',
  energy: 'tired legs',
  fun: 'boredom',
  hygiene: 'sandy feet',
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
};

export function thoughtLine(kind: ThoughtKind, subject: string | null): string {
  return SAYS[kind](subject);
}
