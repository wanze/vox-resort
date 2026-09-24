import type { TileRect } from './parkShapes';

export interface LaneCut {
  readonly at: number;
  readonly z0: number;
  readonly z1: number;
}

export interface DistrictPair {
  readonly west: number;
  readonly east: number;
  readonly cut: LaneCut;
  readonly merged: TileRect;
}

export function neighbourPairs(
  districts: readonly TileRect[],
  droppable: (column: number) => boolean,
): DistrictPair[] {
  const pairs: DistrictPair[] = [];
  districts.forEach((west, westIndex) => {
    const eastIndex = districts.findIndex(
      (east) =>
        east.z0 === west.z0 &&
        east.z1 === west.z1 &&
        east.x0 === west.x1 + 2 &&
        droppable(west.x1 + 1),
    );
    const east = districts[eastIndex];
    if (!east) return;
    pairs.push({
      west: westIndex,
      east: eastIndex,
      cut: { at: west.x1 + 1, z0: west.z0, z1: west.z1 },
      merged: { x0: west.x0, x1: east.x1, z0: west.z0, z1: west.z1 },
    });
  });
  return pairs;
}

export function spreadPairs(pairs: readonly DistrictPair[], count: number): DistrictPair[] {
  const chosen: DistrictPair[] = [];
  const used = new Set<number>();
  if (count <= 0) return chosen;
  const step = Math.max(1, pairs.length / count);
  for (let at = step / 2; at < pairs.length && chosen.length < count; at += step) {
    const pair = pairs[Math.floor(at)]!;
    if (used.has(pair.west) || used.has(pair.east)) continue;
    chosen.push(pair);
    used.add(pair.west).add(pair.east);
  }
  return chosen;
}

export function uncutRuns(
  at: number,
  from: number,
  to: number,
  cuts: readonly LaneCut[],
): { readonly from: number; readonly to: number }[] {
  const mine = cuts.filter((cut) => cut.at === at).toSorted((a, b) => a.z0 - b.z0);
  const runs: { from: number; to: number }[] = [];
  let start = from;
  for (const cut of mine) {
    if (cut.z0 - 1 >= start) runs.push({ from: start, to: cut.z0 - 1 });
    start = Math.max(start, cut.z1 + 1);
  }
  if (start <= to) runs.push({ from: start, to });
  return runs;
}
