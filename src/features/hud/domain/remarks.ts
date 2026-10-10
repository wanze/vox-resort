import { isComplaint, type ThoughtTally } from '../../sim/domain/thoughts';

export interface Remark {
  readonly tally: ThoughtTally;
  readonly complaint: boolean;
  // Against the loudest remark, so the longest bar is always full.
  readonly share: number;
}

// Complaints first, as those are what the player can act on; each keeps its order by count.
export function remarksOf(loudest: readonly ThoughtTally[]): readonly Remark[] {
  const most = Math.max(1, ...loudest.map((tally) => tally.count));
  return loudest
    .map((tally) => ({ tally, complaint: isComplaint(tally.kind), share: tally.count / most }))
    .toSorted((a, b) => Number(b.complaint) - Number(a.complaint));
}
