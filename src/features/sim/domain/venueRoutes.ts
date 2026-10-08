import { nodeIndexFor, type NodeIndex } from '../../crowd/domain/nearestNode';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import { doorsFor } from './doors';
import { flowFieldFor, type FlowField, type FlowOptions } from './flowField';
import type { Lodging } from './lodgings';
import { sandRoutesFor, type SandRoute } from './sandRoute';
import type { Venue } from './venues';

// The furthest beach building on the reference plot is 28 tiles from a gate; 40 leaves
// room for detours.
export const SAND_ROUTE_TILES = 40;

const STEP_FREE: FlowOptions = { stepFree: true };

// Only what the guest and staff routers compute alike. Each router keeps its own: a field one
// swept would change what the other scores by the straight line, and what a guest save holds.
export interface VenueRoutes {
  readonly index: NodeIndex;
  readonly sweeps: number;
  sweep(sources: readonly number[], options?: FlowOptions): FlowField;
  lodgingField(lodging: number, stepFree: boolean): FlowField;
  sandRoutesOf(venue: number): readonly SandRoute[];
}

// Replaced whole on a rebuild, never cleared: every index in it is into one graph and its lists.
export function createVenueRoutes(
  network: WalkNetwork,
  venues: readonly Venue[],
  lodgings: readonly Lodging[],
): VenueRoutes {
  const index = nodeIndexFor(network);
  const lodgingFields: (FlowField | null)[] = lodgings.map(() => null);
  const stepFreeLodgingFields: (FlowField | null)[] = lodgings.map(() => null);
  const sandRoutes: (readonly SandRoute[] | null)[] = venues.map(() => null);
  let sweeps = 0;

  const sweep = (sources: readonly number[], options?: FlowOptions): FlowField => {
    sweeps++;
    return flowFieldFor(network, sources, options);
  };

  return {
    index,
    get sweeps() {
      return sweeps;
    },
    sweep,
    lodgingField(lodging, stepFree) {
      const swept = stepFree ? stepFreeLodgingFields : lodgingFields;
      swept[lodging] ??= sweep(
        doorsFor(lodgings[lodging]!, index).nodes,
        stepFree ? STEP_FREE : undefined,
      );
      return swept[lodging];
    },
    sandRoutesOf(venue) {
      sandRoutes[venue] ??= sandRoutesFor(
        network,
        doorsFor(venues[venue]!, index, network).sand,
        SAND_ROUTE_TILES,
      );
      return sandRoutes[venue];
    },
  };
}
