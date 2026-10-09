import type { ThoughtsSnapshot } from './resortSnapshot';
import type { Venue } from './venues';

// Only ever appended to: a save keeps a slot per person and kind, and widenThoughts pads an older
// save's rows with the kinds it had not heard of.
export const THOUGHT_KINDS = [
  'queue-too-long',
  'closed',
  'nothing-for',
  'no-bed',
  'filthy',
  'enjoyed',
  'lovely',
  'littered',
  'broken',
  'hurt',
  'no-step-free',
  'great-show',
  'called-off',
  'welcomed',
  'fireworks',
  'photo',
  'sunset',
] as const;

export type ThoughtKind = (typeof THOUGHT_KINDS)[number];

const KINDS = THOUGHT_KINDS.length;

const PRAISE: ReadonlySet<ThoughtKind> = new Set([
  'enjoyed',
  'lovely',
  'great-show',
  'welcomed',
  'fireworks',
  'photo',
  'sunset',
]);

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

// The subject last heard of that kind this stay, which a review quotes for a photo.
export function lastSubjectOf(
  thoughts: Thoughts,
  person: number,
  kind: ThoughtKind,
): string | null {
  return thoughts.heardSubject[person * KINDS + THOUGHT_KINDS.indexOf(kind)] ?? null;
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

export function snapshotThoughts(
  thoughts: Thoughts,
  day: ReadonlyMap<string, ThoughtTally>,
): ThoughtsSnapshot {
  return {
    kind: thoughts.kind.slice(),
    subject: [...thoughts.subject],
    at: thoughts.at.slice(),
    stay: thoughts.stay.slice(),
    worstKind: thoughts.worstKind.slice(),
    worstSubject: [...thoughts.worstSubject],
    heardAt: thoughts.heardAt.slice(),
    heardSubject: [...thoughts.heardSubject],
    day: [...day].map(([key, tally]) => [key, { ...tally }]),
  };
}

export function restoreThoughts(
  thoughts: Thoughts,
  day: Map<string, ThoughtTally>,
  snapshot: ThoughtsSnapshot,
): void {
  thoughts.kind.set(snapshot.kind);
  thoughts.at.set(snapshot.at);
  thoughts.stay.set(snapshot.stay);
  thoughts.worstKind.set(snapshot.worstKind);
  thoughts.heardAt.set(snapshot.heardAt);
  copyInto(thoughts.subject, snapshot.subject);
  copyInto(thoughts.worstSubject, snapshot.worstSubject);
  copyInto(thoughts.heardSubject, snapshot.heardSubject);
  day.clear();
  for (const [key, tally] of snapshot.day) day.set(key, { ...tally });
}

export function widenThoughts(snapshot: ThoughtsSnapshot): ThoughtsSnapshot {
  const people = snapshot.kind.length;
  const saved = people === 0 ? KINDS : snapshot.stay.length / people;
  if (!Number.isInteger(saved) || saved >= KINDS) return snapshot;
  const stay = new Uint16Array(people * KINDS);
  const heardAt = new Int32Array(people * KINDS).fill(NEVER);
  const heardSubject: (string | null)[] = Array.from({ length: people * KINDS }, () => null);
  for (let person = 0; person < people; person++) {
    for (let kind = 0; kind < saved; kind++) {
      stay[person * KINDS + kind] = snapshot.stay[person * saved + kind]!;
      heardAt[person * KINDS + kind] = snapshot.heardAt[person * saved + kind]!;
      heardSubject[person * KINDS + kind] = snapshot.heardSubject[person * saved + kind] ?? null;
    }
  }
  return { ...snapshot, stay, heardAt, heardSubject };
}

// A loop, not a spread into splice: a big plot has more subjects than a call takes arguments.
function copyInto(target: (string | null)[], source: readonly (string | null)[]): void {
  for (let i = 0; i < target.length; i++) target[i] = source[i] ?? null;
}
