import type { PartyKind } from '../../guests/domain/parties';
import {
  isComplaint,
  stayCount,
  THOUGHT_KINDS,
  worstOf,
  type ThoughtKind,
  type Thoughts,
} from './thoughts';

export interface Review {
  // Never reused, unlike a body, so it names the review.
  readonly party: number;
  readonly family: string;
  readonly partyKind: PartyKind;
  readonly name: string;
  readonly nights: number;
  readonly stars: number;
  readonly complaint: ThoughtKind | null;
  readonly praise: ThoughtKind | null;
  readonly subject: string | null;
}

export const REVIEWS_KEPT = 12;

const COMPLAINTS = THOUGHT_KINDS.filter(isComplaint);

const PRAISES = THOUGHT_KINDS.filter((kind) => !isComplaint(kind));

// Written before check-out clears the party, and never read back by the simulation.
export function reviewFor(parts: {
  readonly thoughts: Thoughts;
  readonly members: readonly number[];
  readonly spokesperson: number;
  readonly party: number;
  readonly family: string;
  readonly partyKind: PartyKind;
  readonly name: string;
  readonly nights: number;
  readonly happiness: (person: number) => number;
}): Review {
  const { thoughts, members, spokesperson } = parts;
  const complaint = mostThought(thoughts, members, COMPLAINTS);
  return {
    party: parts.party,
    family: parts.family,
    partyKind: parts.partyKind,
    name: parts.name,
    nights: parts.nights,
    stars: starsOf(members, parts.happiness),
    complaint,
    praise: mostThought(thoughts, members, PRAISES),
    subject: complaint === null ? null : subjectOf(thoughts, [spokesperson, ...members], complaint),
  };
}

// A happy party is quoted on what it liked, anybody else on what went wrong.
export function quoteOf(review: Review): ThoughtKind | null {
  if (review.stars >= 4) return review.praise ?? review.complaint;
  return review.complaint ?? review.praise;
}

export function keepReview(kept: readonly Review[], review: Review): readonly Review[] {
  return [review, ...kept].slice(0, REVIEWS_KEPT);
}

function starsOf(members: readonly number[], happiness: (person: number) => number): number {
  if (members.length === 0) return 1;
  const mean = members.reduce((sum, member) => sum + happiness(member), 0) / members.length;
  return Math.max(1, Math.round(5 * mean));
}

// Ties go to the earlier kind, so two runs of the same stay write the same review.
function mostThought(
  thoughts: Thoughts,
  members: readonly number[],
  kinds: readonly ThoughtKind[],
): ThoughtKind | null {
  let best: ThoughtKind | null = null;
  let bestCount = 0;
  for (const kind of kinds) {
    const count = members.reduce((sum, member) => sum + stayCount(thoughts, member, kind), 0);
    if (count <= bestCount) continue;
    best = kind;
    bestCount = count;
  }
  return best;
}

function subjectOf(
  thoughts: Thoughts,
  people: readonly number[],
  complaint: ThoughtKind,
): string | null {
  for (const person of people) {
    const worst = worstOf(thoughts, person);
    if (worst?.kind === complaint) return worst.subject;
  }
  return null;
}
