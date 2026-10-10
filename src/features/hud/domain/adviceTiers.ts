import type { Advice } from '../../sim/domain/advice';
import { severityOf, type Severity } from './news';

// Note is what the panel and the map show but never toasts.
export type AdviceTier = Severity | 'note';

const ADVICE_TIERS: readonly AdviceTier[] = ['urgent', 'warning', 'note'];

export const tierOf = (advice: Advice): AdviceTier => severityOf(advice) ?? 'note';

export interface TierGroup {
  readonly tier: AdviceTier;
  readonly advice: readonly Advice[];
}

// Keeps the order advice arrives in within a tier, as that is already loudest first.
export function adviceTiers(advice: readonly Advice[]): readonly TierGroup[] {
  return ADVICE_TIERS.map((tier) => ({
    tier,
    advice: advice.filter((each) => tierOf(each) === tier),
  })).filter((group) => group.advice.length > 0);
}
