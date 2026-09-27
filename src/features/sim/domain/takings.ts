import type { Guests } from '../../guests/domain/guests';
import { NO_HOME } from '../../guests/domain/homes';

// The whole stay on arrival: one transaction per wave instead of one per guest per night.
export function stayBill(
  arrived: readonly number[],
  guests: Guests,
  rateOf: (home: number) => number,
  takings?: VenueTakings,
): number {
  let bill = 0;
  for (const person of arrived) {
    const home = guests.home[person]!;
    if (home === NO_HOME) continue;
    const stay = rateOf(home) * guests.nights[person]!;
    bill += stay;
    if (takings) earn(takings, guests.homes[home]!.key, stay);
  }
  return bill;
}

// On the reference plot 2 942 a day against about 20 000 taken: sprawl shows without sinking it.
const MAINTENANCE_SHARE = 0.01;

export function maintenanceFor(costs: readonly number[]): number {
  let total = 0;
  for (const cost of costs) total += cost;
  return Math.round(total * MAINTENANCE_SHARE);
}

// By key: an edit reorders the venue list.
export type VenueTakings = Map<string, number>;

export function takingsOf(takings: VenueTakings, key: string): number {
  return takings.get(key) ?? 0;
}

export function earn(takings: VenueTakings, key: string, amount: number): void {
  if (amount === 0) return;
  takings.set(key, (takings.get(key) ?? 0) + amount);
}
