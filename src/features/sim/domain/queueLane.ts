import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { blockedAt } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { terrainAt } from '../../layout/domain/shoreline';

const QUEUE_SPACING = 6;

// A ceiling, not the length: a venue's lane is shorter wherever the paving runs out.
export const MAX_QUEUE_SHOWN = 12;

export interface QueueSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly heading: number;
}

// Built once per venue with its flow field: every position is on a graph that a
// rebuild renumbers.
export function queueLaneFor(
  network: WalkNetwork,
  door: number,
  venueCentre: { readonly x: number; readonly z: number },
): readonly QueueSpot[] {
  const start = network.nodes[door]!;
  const spots: QueueSpot[] = [
    {
      x: start.x,
      z: start.z,
      y: start.y,
      heading: Math.atan2(venueCentre.x - start.x, venueCentre.z - start.z),
    },
  ];
  let at = door;
  let untilNext = QUEUE_SPACING;

  while (spots.length < MAX_QUEUE_SHOWN) {
    const edge = awayFrom(network, at, venueCentre);
    if (edge === -1) break;
    const { to, length } = network.edges[edge]!;
    const from = network.nodes[at]!;
    const end = network.nodes[to]!;
    let along = 0;
    while (untilNext <= length - along && spots.length < MAX_QUEUE_SHOWN) {
      along += untilNext;
      untilNext = QUEUE_SPACING;
      const t = along / length;
      const x = from.x + (end.x - from.x) * t;
      const z = from.z + (end.z - from.z) * t;
      const ahead = spots.at(-1)!;
      spots.push({
        x,
        z,
        y: from.y + (end.y - from.y) * t,
        heading: Math.atan2(ahead.x - x, ahead.z - z),
      });
    }
    untilNext -= length - along;
    at = to;
  }
  return spots;
}

// Straight, unlike the paved lane: the sand beside a line is somewhere to stand,
// the grass beside a path is not.
export function sandLaneFor(
  network: WalkNetwork,
  door: { readonly x: number; readonly z: number },
  towards: { readonly x: number; readonly z: number },
): readonly QueueSpot[] {
  const dx = towards.x - door.x;
  const dz = towards.z - door.z;
  const length = Math.hypot(dx, dz);
  const heading = Math.atan2(-dx, -dz);
  const spots: QueueSpot[] = [{ x: door.x, z: door.z, y: BEACH_SURFACE, heading }];
  if (length === 0) return spots;
  for (let slot = 1; slot < MAX_QUEUE_SHOWN; slot++) {
    const x = door.x + (dx / length) * QUEUE_SPACING * slot;
    const z = door.z + (dz / length) * QUEUE_SPACING * slot;
    if (!openSandAt(network, x, z)) break;
    spots.push({ x, z, y: BEACH_SURFACE, heading });
  }
  return spots;
}

function openSandAt(network: WalkNetwork, x: number, z: number): boolean {
  const { beach, sand } = network;
  if (!beach || !sand || blockedAt(sand, x, z)) return false;
  return (
    terrainAt(beach.shore, Math.floor(x / TILE_VOXELS), Math.floor(z / TILE_VOXELS)) === 'beach'
  );
}

// Only ever further: turning back would wrap the lane round its building, and a
// strictly growing distance needs no visited set. Ties go to the lower index.
function awayFrom(
  network: WalkNetwork,
  at: number,
  centre: { readonly x: number; readonly z: number },
): number {
  const here = network.nodes[at]!;
  let best = -1;
  let bestNode = -1;
  let bestDistance = Math.hypot(here.x - centre.x, here.z - centre.z);
  for (const edge of here.exits) {
    const to = network.edges[edge]!.to;
    const node = network.nodes[to]!;
    const distance = Math.hypot(node.x - centre.x, node.z - centre.z);
    const further = distance > bestDistance || (distance === bestDistance && to < bestNode);
    if (!further) continue;
    best = edge;
    bestNode = to;
    bestDistance = distance;
  }
  return best;
}
