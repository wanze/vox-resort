import { nodeIndexFor } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { MIN_SEEN } from '../../overlays/domain/overlays';

// Walkers per tile over the 3x3 window. At the reference resort's busiest hour about 5 % of
// walkers are past it, nearly all on one-wide approaches.
export const CROWDED_FROM = 1.5;

// Where the reference resort's busiest approaches peak (3 to 4 a tile): an ordinary day's worst is
// a full crush, and only the check-in surge at the gate goes past it.
export const CRUSHED_AT = 3;

// Halfway to a full crush: a little elbowing goes unremarked.
export const CROWDED_HEARD = 0.5;

// Two thirds of DARK_UNEASE: a crush is unpleasant but not frightening. As unease rather than a
// dent to the mood, so it lasts the day: a dent recovers within the hour and changed nothing.
export const CROWD_UNEASE = 0.1;

// The windows are fixed per network, so an edit replaces the whole thing.
export interface PathCrowds {
  readonly window: { readonly start: Int32Array; readonly nodes: Int32Array };
  readonly walkers: Uint16Array;
  readonly density: Float32Array;
  readonly felt: Float32Array;
  readonly seen: Float32Array;
}

// A node with no exits is in nobody's window and has none of its own: nobody walks it.
export function createPathCrowds(network: WalkNetwork): PathCrowds {
  const { nodes } = network;
  const byTile = nodeIndexFor(network);
  const start = new Int32Array(nodes.length + 1);
  const members: number[] = [];
  for (const [index, node] of nodes.entries()) {
    start[index] = members.length;
    if (node.exits.length === 0) continue;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const near of byTile.at(node.tileX + dx, node.tileZ + dz) ?? []) members.push(near);
      }
    }
  }
  start[nodes.length] = members.length;
  return {
    window: { start, nodes: Int32Array.from(members) },
    walkers: new Uint16Array(nodes.length),
    density: new Float32Array(nodes.length),
    felt: new Float32Array(nodes.length),
    seen: new Float32Array(nodes.length),
  };
}

// Once a frame, so it allocates nothing. Only walkers on the paving count: a queue already costs,
// and a sleeper or a guest inside is not in the crush.
export function countWalkers(
  crowds: PathCrowds,
  node: Int32Array,
  present: Uint8Array,
  holds: (person: number) => boolean,
): void {
  const { walkers, density, window } = crowds;
  walkers.fill(0);
  const people = Math.min(node.length, present.length);
  for (let person = 0; person < people; person++) {
    if (present[person] !== 1) continue;
    const at = node[person]!;
    if (at < 0 || at >= walkers.length || holds(person)) continue;
    walkers[at]!++;
  }
  for (let at = 0; at < density.length; at++) {
    const from = window.start[at]!;
    const to = window.start[at + 1]!;
    let sum = 0;
    for (let entry = from; entry < to; entry++) sum += walkers[window.nodes[entry]!]!;
    density[at] = to > from ? sum / (to - from) : 0;
  }
}

export function crushOf(crowds: PathCrowds, node: number): number {
  if (node < 0 || node >= crowds.density.length) return 0;
  const over = (crowds.density[node]! - CROWDED_FROM) / (CRUSHED_AT - CROWDED_FROM);
  return over <= 0 ? 0 : over >= 1 ? 1 : over;
}

// From the walkers countWalkers left, once a frame as the footfall is sampled.
export function sampleCrush(crowds: PathCrowds): void {
  const { walkers, felt, seen } = crowds;
  for (let at = 0; at < walkers.length; at++) {
    const count = walkers[at]!;
    if (count === 0) continue;
    seen[at]! += count;
    felt[at]! += count * crushOf(crowds, at);
  }
}

// Daily, with the footfall, so the map and the advice show the last few days.
export function fadePathCrowds(crowds: PathCrowds): void {
  for (let at = 0; at < crowds.seen.length; at++) {
    crowds.felt[at]! *= 0.5;
    crowds.seen[at]! *= 0.5;
  }
}

const shareAt = (crowds: PathCrowds, at: number): number =>
  crowds.seen[at]! >= MIN_SEEN ? crowds.felt[at]! / crowds.seen[at]! : Number.NaN;

export function crushedShare(crowds: PathCrowds): Float32Array {
  const values = new Float32Array(crowds.seen.length);
  for (let at = 0; at < values.length; at++) values[at] = shareAt(crowds, at);
  return values;
}

export interface Crowded {
  readonly tileX: number;
  readonly tileZ: number;
  readonly share: number;
}

export function worstCrowded(crowds: PathCrowds, network: WalkNetwork): Crowded | null {
  let worst = -1;
  let most = -1;
  const nodes = Math.min(crowds.seen.length, network.nodes.length);
  for (let at = 0; at < nodes; at++) {
    const share = shareAt(crowds, at);
    if (share > most) {
      worst = at;
      most = share;
    }
  }
  if (worst < 0) return null;
  const { tileX, tileZ } = network.nodes[worst]!;
  return { tileX, tileZ, share: most };
}
