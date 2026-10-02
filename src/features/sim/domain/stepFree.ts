import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { flowFieldFor } from './flowField';
import type { Venue } from './venues';

export interface StepFreeReach {
  // Per node, for the overlay's ramp: 0 where a wheelchair gets from the gates, 1 where only
  // stairs lead, NaN where nobody gets at all.
  readonly nodes: Float32Array;
  // Reached from the gates on foot but not step-free, in venue order.
  readonly cutOff: readonly Venue[];
  readonly reached: number;
  readonly venues: number;
}

// Only venues with a door on the paving count: one on the sand is out of a wheelchair's reach
// whatever is built, and one nobody reaches on foot is the unreachable advice's.
export function stepFreeReachOn(
  network: WalkNetwork,
  venues: readonly Venue[],
  doorsOf: (venue: Venue) => readonly number[],
  gates: readonly number[],
): StepFreeReach {
  const onFoot = flowFieldFor(network, gates).hops;
  const rolling = flowFieldFor(network, gates, { stepFree: true }).hops;
  const nodes = Float32Array.from(onFoot, (hops, node) =>
    hops < 0 ? Number.NaN : rolling[node]! < 0 ? 1 : 0,
  );
  const cutOff: Venue[] = [];
  let counted = 0;
  for (const venue of venues) {
    const doors = doorsOf(venue);
    if (!doors.some((door) => (onFoot[door] ?? -1) >= 0)) continue;
    counted++;
    if (!doors.some((door) => (rolling[door] ?? -1) >= 0)) cutOff.push(venue);
  }
  return { nodes, cutOff, reached: counted - cutOff.length, venues: counted };
}
