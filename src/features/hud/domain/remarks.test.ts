import { describe, expect, it } from 'vitest';
import type { ThoughtTally } from '../../sim/domain/thoughts';
import { remarksOf } from './remarks';

const tally = (kind: ThoughtTally['kind'], count: number): ThoughtTally => ({
  kind,
  subject: null,
  count,
});

describe('remarksOf', () => {
  it('puts complaints before praise, keeping each in its order', () => {
    const remarks = remarksOf([
      tally('enjoyed', 9),
      tally('queue-too-long', 6),
      tally('lovely', 4),
      tally('littered', 2),
    ]);
    expect(remarks.map((remark) => remark.tally.kind)).toEqual([
      'queue-too-long',
      'littered',
      'enjoyed',
      'lovely',
    ]);
    expect(remarks.map((remark) => remark.complaint)).toEqual([true, true, false, false]);
  });

  it('measures each against the loudest', () => {
    const remarks = remarksOf([tally('enjoyed', 8), tally('filthy', 2)]);
    expect(remarks.map((remark) => remark.share)).toEqual([0.25, 1]);
  });

  it('says nothing for a quiet day', () => {
    expect(remarksOf([])).toEqual([]);
  });
});
