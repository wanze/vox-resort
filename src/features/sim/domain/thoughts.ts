import type { Venue } from './venues';

export type ThoughtKind =
  | 'queue-too-long'
  | 'closed'
  | 'nothing-for'
  | 'no-bed'
  | 'filthy'
  | 'enjoyed'
  | 'lovely'
  | 'littered';

export const THOUGHT_KINDS: readonly ThoughtKind[] = [
  'queue-too-long',
  'closed',
  'nothing-for',
  'no-bed',
  'filthy',
  'enjoyed',
  'lovely',
  'littered',
];

const KINDS = THOUGHT_KINDS.length;

const PRAISE: ReadonlySet<ThoughtKind> = new Set(['enjoyed', 'lovely']);

// Two simulated hours. The router reports a homeless guest at every node they reach all night,
// and a guest with nothing to do at every node they wander past; without this, one guest would
// fill the day's tally on their own.
export const REPEAT_TICKS = 120;

const MOST = 65_535;

// Well below NEEDS_CLEANING (0.7), where a cleaner is already sent: a guest who notices the dirt
// means the cleaners are losing.
const FILTHY_BELOW = 0.4;

const ENJOYED_FROM = 0.8;

// Bare paving reads 0 and only litter goes negative, so these hear only the two ends.
const LOVELY_ABOVE = 0.6;

const LITTERED_BELOW = -0.3;

const NEVER = -(2 ** 31);

export interface Thoughts {
  readonly people: number;
  // -1 for nobody has thought anything yet.
  readonly kind: Int8Array;
  readonly subject: (string | null)[];
  readonly at: Int32Array;
  // people * THOUGHT_KINDS.length; a stay's worth, for the review.
  readonly stay: Uint16Array;
  readonly worstKind: Int8Array;
  readonly worstSubject: (string | null)[];
  // Per kind rather than per person: a no-bed between two nothing-fors is still a repeat.
  readonly heardAt: Int32Array;
  readonly heardSubject: (string | null)[];
}

export interface ThoughtTally {
  readonly kind: ThoughtKind;
  readonly subject: string | null;
  readonly count: number;
}

export function isComplaint(kind: ThoughtKind): boolean {
  return !PRAISE.has(kind);
}

export function visitThought(role: Venue['role'], clean: number): 'filthy' | 'enjoyed' | null {
  if (clean < FILTHY_BELOW) return 'filthy';
  return role === 'activity' && clean >= ENJOYED_FROM ? 'enjoyed' : null;
}

export function surroundingsThought(around: number): 'lovely' | 'littered' | null {
  if (around > LOVELY_ABOVE) return 'lovely';
  return around < LITTERED_BELOW ? 'littered' : null;
}

export function createThoughts(people: number): Thoughts {
  return {
    people,
    kind: new Int8Array(people).fill(-1),
    subject: Array.from({ length: people }, () => null),
    at: new Int32Array(people),
    stay: new Uint16Array(people * KINDS),
    worstKind: new Int8Array(people).fill(-1),
    worstSubject: Array.from({ length: people }, () => null),
    heardAt: new Int32Array(people * KINDS).fill(NEVER),
    heardSubject: Array.from({ length: people * KINDS }, () => null),
  };
}

export function think(
  thoughts: Thoughts,
  person: number,
  kind: ThoughtKind,
  subject: string | null,
  tick: number,
): boolean {
  if (person < 0 || person >= thoughts.people) return false;
  const index = THOUGHT_KINDS.indexOf(kind);
  const slot = person * KINDS + index;
  const repeat =
    thoughts.heardSubject[slot] === subject && tick - thoughts.heardAt[slot]! < REPEAT_TICKS;
  if (repeat) return false;
  thoughts.heardAt[slot] = tick;
  thoughts.heardSubject[slot] = subject;
  thoughts.kind[person] = index;
  thoughts.subject[person] = subject;
  thoughts.at[person] = tick;
  if (thoughts.stay[slot]! < MOST) thoughts.stay[slot]!++;
  if (isComplaint(kind)) rememberWorst(thoughts, person, index, subject);
  return true;
}

// Ties keep the complaint already remembered, so the subject never changes kind on a draw.
function rememberWorst(
  thoughts: Thoughts,
  person: number,
  index: number,
  subject: string | null,
): void {
  const worst = thoughts.worstKind[person]!;
  const row = person * KINDS;
  if (worst !== index && worst >= 0 && thoughts.stay[row + index]! <= thoughts.stay[row + worst]!) {
    return;
  }
  thoughts.worstKind[person] = index;
  thoughts.worstSubject[person] = subject;
}

export function forgetStay(thoughts: Thoughts, person: number): void {
  if (person < 0 || person >= thoughts.people) return;
  thoughts.kind[person] = -1;
  thoughts.subject[person] = null;
  thoughts.at[person] = 0;
  thoughts.worstKind[person] = -1;
  thoughts.worstSubject[person] = null;
  const row = person * KINDS;
  thoughts.stay.fill(0, row, row + KINDS);
  thoughts.heardAt.fill(NEVER, row, row + KINDS);
  thoughts.heardSubject.fill(null, row, row + KINDS);
}

export function latestOf(
  thoughts: Thoughts,
  person: number,
): { readonly kind: ThoughtKind; readonly subject: string | null } | null {
  const kind = THOUGHT_KINDS[thoughts.kind[person] ?? -1];
  return kind ? { kind, subject: thoughts.subject[person] ?? null } : null;
}

export function stayCount(thoughts: Thoughts, person: number, kind: ThoughtKind): number {
  return thoughts.stay[person * KINDS + THOUGHT_KINDS.indexOf(kind)] ?? 0;
}

export function worstOf(
  thoughts: Thoughts,
  person: number,
): { readonly kind: ThoughtKind; readonly subject: string | null } | null {
  const kind = THOUGHT_KINDS[thoughts.worstKind[person] ?? -1];
  return kind ? { kind, subject: thoughts.worstSubject[person] ?? null } : null;
}

export function createDay(): Map<string, ThoughtTally> {
  return new Map();
}

export function tallyInto(
  day: Map<string, ThoughtTally>,
  kind: ThoughtKind,
  subject: string | null,
): void {
  const key = `${kind}|${subject ?? ''}`;
  day.set(key, { kind, subject, count: (day.get(key)?.count ?? 0) + 1 });
}

export function loudest(
  day: ReadonlyMap<string, ThoughtTally>,
  shown: number,
): readonly ThoughtTally[] {
  return [...day.values()]
    .toSorted(
      (a, b) =>
        b.count - a.count ||
        THOUGHT_KINDS.indexOf(a.kind) - THOUGHT_KINDS.indexOf(b.kind) ||
        compareSubjects(a.subject, b.subject),
    )
    .slice(0, Math.max(0, shown));
}

const compareSubjects = (a: string | null, b: string | null): number => {
  const left = a ?? '';
  const right = b ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
};
