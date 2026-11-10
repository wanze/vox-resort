import { DEMAND_GROUPS, type Demand, type DemandLine } from '../../sim/domain/demand';
import type { Review } from '../../sim/domain/reviews';
import { isComplaint, type ThoughtTally } from '../../sim/domain/thoughts';

export interface DemandFigures {
  // Lines past comfortable at their busiest, which want building.
  readonly short: number;
  readonly loud: boolean;
  readonly most: DemandLine | null;
}

const LINES = Object.values(DEMAND_GROUPS).flat();

export function demandFigures(demand: Demand, loudFrom: number): DemandFigures {
  const wanting = LINES.filter((line) => demand.lines[line].pressure > 0);
  const most = wanting.reduce<DemandLine | null>(
    (top, line) =>
      top === null || demand.lines[line].pressure > demand.lines[top].pressure ? line : top,
    null,
  );
  return {
    short: wanting.length,
    loud: wanting.some((line) => demand.lines[line].pressure > loudFrom),
    most,
  };
}

export interface VoiceFigures {
  readonly praise: number;
  readonly complaints: number;
  // Over the reviews given, null before the first.
  readonly stars: number | null;
}

export function voiceFigures(
  loudest: readonly ThoughtTally[],
  reviews: readonly Review[],
): VoiceFigures {
  const said = (complaint: boolean): number =>
    loudest
      .filter((tally) => isComplaint(tally.kind) === complaint)
      .reduce((sum, tally) => sum + tally.count, 0);
  const stars =
    reviews.length === 0
      ? null
      : reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length;
  return { praise: said(false), complaints: said(true), stars };
}
