import type { CameraMode, CompassDirection } from '../../layout/domain/worldBounds';
import type { Demand } from '../../sim/domain/demand';
import type { Rating } from '../../sim/domain/rating';
import type { Review } from '../../sim/domain/reviews';
import type { Hiring, Roster } from '../../sim/domain/staff';
import type { ThoughtTally } from '../../sim/domain/thoughts';
import type { Weather } from '../../sim/domain/weather';
import type { StaffTally } from './staffPins';

export interface ShowcaseStats {
  readonly backend: 'webgpu' | 'webgl2';
  readonly typeCount: number;
  readonly objectCount: number;
  readonly propCount: number;
  readonly pathCount: number;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly chunkCount: number;
  // Cast shadows are left out so this stays comparable with the mesher's output.
  readonly uniqueTriangleCount: number;
  readonly unmergedTriangleCount: number;
  readonly drawnTriangleCount: number;
  readonly sceneVoxelCount: number;
  readonly meshedVoxelCount: number;
  readonly shadowCount: number;
  readonly occluderCount: number;
  readonly lightCount: number;
  readonly litLightCount: number;
  readonly lightGridCells: number;
  readonly lightGridBytes: number;
  readonly lightBakeMs: number;
  readonly skyBakeMs: number;
  readonly dveMs: number;
  readonly meshMs: number;
  readonly startupMs: number;
  readonly meshedInWorker: boolean;
  // A blocked main thread paints none, so this, not startupMs, says whether the page stayed alive.
  readonly startupFrames: number;
  readonly beds: { readonly total: number; readonly taken: number; readonly unmade: number };
  readonly asleep: number;
  readonly venues: { readonly inside: number; readonly waiting: number };
  readonly routeFields: number;
  readonly guests: { readonly present: number; readonly capacity: number };
  readonly staff: {
    readonly total: number;
    readonly working: number;
    readonly roster: Roster;
    readonly recommended: Roster;
    readonly hiring: Hiring;
    // Per zone, in zone order: who was dealt there.
    readonly zones: readonly Roster[];
  };
  readonly cleanliness: number;
  readonly rating: number;
  readonly weather: Weather;
}

export interface VoicesView {
  readonly loudest: readonly ThoughtTally[];
  readonly reviews: readonly Review[];
}

export interface StatusView {
  readonly day: number;
  readonly rating: Rating;
  // Shown under the rating and counted toward none of it: wheelchair guests who cannot get
  // somewhere are unhappy, and that already reaches the stars.
  readonly stepFree: { readonly reached: number; readonly venues: number };
  readonly present: number;
  readonly beds: { readonly total: number; readonly taken: number };
  readonly demand: Demand | null;
  readonly staff: StaffTally;
}

export interface CameraView {
  readonly mode: CameraMode;
  readonly direction: CompassDirection;
  readonly detail: boolean;
}

export interface BuildNote {
  readonly title: string;
  readonly message: string;
}
