// The beach is terrain with no model to carry sim facts, so they are declared here.

import type { NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Venue } from './venues';

// No placement key can collide: those are `id#n`.
const BEACH_KEY = 'beach';

// Tuned: 0.6/0.2 left the beach nearly empty, 0.85/0.35 all but stopped the pool and courts being chosen.
const BEACH_RELIEF: readonly NeedRelief[] = [
  { need: 'fun', amount: 0.7 },
  { need: 'energy', amount: 0.3 },
];

const BEACH_DWELL_SECONDS = { min: 45 * 60, max: 120 * 60 } as const;

// Effectively unlimited: the beach has no door to queue at.
const BEACH_CAPACITY = 100_000;

export function beachVenueFor(network: WalkNetwork): Venue | null {
  const { gates, nodes } = network;
  if (!network.beach || gates.length === 0) return null;
  let x = 0;
  let z = 0;
  for (const gate of gates) {
    x += nodes[gate]!.x;
    z += nodes[gate]!.z;
  }
  const first = nodes[gates[0]!]!;
  return {
    key: BEACH_KEY,
    id: BEACH_KEY,
    label: 'Beach',
    role: 'activity',
    satisfies: BEACH_RELIEF,
    capacity: BEACH_CAPACITY,
    dwellSeconds: BEACH_DWELL_SECONDS,
    // No roof, so the beach shuts in the rain.
    shelter: 'open',
    x: x / gates.length,
    z: z / gates.length,
    tileX: first.tileX,
    tileZ: first.tileZ,
    tilesX: 1,
    tilesZ: 1,
    doors: [],
  };
}

export function isBeach(venue: Venue): boolean {
  return venue.key === BEACH_KEY;
}
