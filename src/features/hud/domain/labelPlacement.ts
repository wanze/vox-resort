/**
 * Which placement of each object type carries the type's floating label.
 *
 * The HUD labels object *types*, not placements: fifteen cottages do not need
 * fifteen captions. That leaves a choice of which cottage to point at, and the
 * obvious answer — the first one the plan mentions — does not survive the resort
 * growing. A plan that introduces its shops along the north frontage puts every
 * shop label in the same strip of sky, and two dozen captions land on top of one
 * another while the rest of the plot carries none.
 *
 * So each type takes the placement furthest from the labels already placed.
 * Types are still visited in plan order, so the choice is deterministic and the
 * same resort always labels the same buildings; what changes is that the
 * captions end up spread across the plot rather than stacked at whichever edge
 * the plan happened to start from.
 *
 * Pure arithmetic over positions: no DOM, no camera, no projection.
 */

export interface LabelCandidate {
  /** Object type this placement is of; one label is chosen per distinct id. */
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

const distanceSquared = (a: LabelCandidate, b: LabelCandidate): number =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * One placement per type, spread across the plot.
 *
 * Returned in first-appearance order of the type, so the HUD list keeps the
 * order the plan reads in.
 */
export function spreadLabelAnchors<T extends LabelCandidate>(placements: readonly T[]): T[] {
  const byType = new Map<string, T[]>();
  for (const placement of placements) {
    let candidates = byType.get(placement.id);
    if (!candidates) {
      candidates = [];
      byType.set(placement.id, candidates);
    }
    candidates.push(placement);
  }

  const chosen: T[] = [];
  for (const candidates of byType.values()) {
    if (chosen.length === 0) {
      chosen.push(candidates[0]!);
      continue;
    }
    let best = candidates[0]!;
    let bestDistance = -1;
    for (const candidate of candidates) {
      // How far this candidate sits from the nearest label already placed.
      let nearest = Number.POSITIVE_INFINITY;
      for (const taken of chosen) {
        nearest = Math.min(nearest, distanceSquared(candidate, taken));
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
    }
    chosen.push(best);
  }
  return chosen;
}
