// Pure and renderer-free so it can run in a worker while the current resort keeps drawing.

import { BUOY_INDEX } from '../../../../voxel-gen/sea/index.ts';
import { benchFraming, type BenchView } from '../../bench/domain/benchConfig';
import { repeatPlot } from '../../bench/domain/plotRepeat';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { createTileOccupancy } from '../../build/domain/tileOccupancy';
import {
  OBJECT_TYPES,
  objectTypeTop,
  SEA_MODELS,
  TILE_VOXELS,
} from '../../catalog/domain/objectTypes';
import { lightsOf, occluderOf } from '../../catalog/domain/placementFacts';
import {
  emptyResortPlan,
  generateResort,
  type GeneratorType,
  type ResortParams,
} from '../../layout/domain/resortGenerator';
import {
  layoutResort,
  tileKey,
  type Placement,
  type ResortLayout,
} from '../../layout/domain/resortLayout';
import { PEDALO_RENTAL_ID, RESORT_PLAN, type ResortPlan } from '../../layout/domain/resortPlan';
import { shoreFor, type Shore } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import {
  CAMERA_FOV_DEGREES,
  cameraFramingFor,
  worldBoundsFor,
  worldExtentOf,
  type CameraFraming,
  type WorldBounds,
} from '../../layout/domain/worldBounds';
import {
  anchorsFor,
  lampReservationFor,
  type Ground,
  type LightAnchor,
} from '../../lighting/domain/lightAnchors';
import {
  bakeLightGrid,
  gridBudgetFor,
  gridInterior,
  lightGridSpecFor,
  type BakedLightGrid,
} from '../../lighting/domain/lightGrid';
import { bakeSkyVisibility, occludes } from '../../lighting/domain/skyVisibility';
import {
  SEA_LEVEL,
  TERRAIN_SPREAD,
  terrainSurfacesFor,
  type SurfaceGeometry,
  type TerrainSurfaces,
} from '../../rendering/domain/terrainSurface';
import { buoyLampSites } from '../../sea/domain/buoyLamps';
import { swimAreaMoorings, type Mooring, type Rental } from '../../sea/domain/swimArea';

const GENERATOR_TYPES: readonly GeneratorType[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  category: type.category,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
  placement: type.model.placement,
}));

const CATALOGUE_LIGHTS = OBJECT_TYPES.flatMap((type) => type.model.lights);

export type ResortSource =
  | { readonly kind: 'generate'; readonly params: ResortParams }
  | { readonly kind: 'clear'; readonly params: ResortParams }
  | { readonly kind: 'authored' };

export interface PrepRequest {
  readonly source: ResortSource;
  readonly repeat: number;
  readonly view: BenchView | null;
}

export interface Plot {
  readonly layout: ResortLayout;
  readonly placements: Placement[];
  readonly props: Placement[];
  readonly paths: Placement[];
  readonly rails: Placement[];
}

export interface PreparedLighting {
  readonly grid: BakedLightGrid;
  readonly bakeMs: number;
  readonly skyBakeMs: number;
}

export interface PreparedResort {
  readonly plan: ResortPlan;
  readonly plot: Plot;
  readonly moorings: readonly Mooring[];
  readonly anchors: readonly LightAnchor[];
  readonly lighting: PreparedLighting | null;
  readonly bounds: WorldBounds;
  readonly framing: CameraFraming;
  readonly surfaces: TerrainSurfaces;
  readonly prepMs: number;
}

export function everythingOn(plot: Plot): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths, ...plot.rails];
}

// Rails are left out: a rail stands on the paving it guards, so the tile is the slab's.
export function claimingOn(
  plot: Pick<Plot, 'placements' | 'props' | 'paths'> | ResortLayout,
): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths];
}

export function rentalOf(shore: Shore | null, placements: readonly Placement[]): Rental | null {
  if (!shore) return null;
  const hut = placements.find((placement) => placement.id === PEDALO_RENTAL_ID);
  if (!hut) return null;
  return {
    x: (hut.tileX + hut.tilesX / 2) * TILE_VOXELS,
    z: (hut.tileZ + hut.tilesZ / 2) * TILE_VOXELS,
  };
}

function planOf(source: ResortSource): ResortPlan {
  if (source.kind === 'authored') return RESORT_PLAN;
  const { tilesX, tilesZ, seed } = source.params;
  return source.kind === 'clear'
    ? emptyResortPlan(tilesX, tilesZ, seed)
    : generateResort(GENERATOR_TYPES, source.params);
}

function layOut(plan: ResortPlan, repeat: number): Plot {
  const layout = layoutResort(OBJECT_TYPES.map(layoutItemFor), plan);
  const tile = <T extends { key: string; x: number; z: number }>(items: readonly T[]): T[] =>
    repeatPlot(items, repeat, layout.tilesX * TILE_VOXELS, layout.tilesZ * TILE_VOXELS);
  return {
    layout,
    placements: tile(layout.placements),
    props: tile(layout.props),
    paths: tile(layout.paths),
    rails: tile(layout.rails),
  };
}

// Paving is passed in so no buoy is moored in a pier: the sea lanes run jetty out through the line.
function mooringsFor(shore: Shore | null, layout: ResortLayout): Mooring[] {
  const paved = new Set(layout.paths.map((placement) => tileKey(placement.tileX, placement.tileZ)));
  return swimAreaMoorings({
    shore,
    rental: rentalOf(shore, layout.placements),
    claimed: (tileX, tileZ) => paved.has(tileKey(tileX, tileZ)),
  });
}

// A buoy never leaves its mooring, so its lamp can be baked like a street lamp's.
function buoyLampsAt(moorings: readonly Mooring[]): LightAnchor[] {
  const buoy = SEA_MODELS[BUOY_INDEX]!;
  return buoyLampSites(moorings, buoy, SEA_LEVEL).flatMap((site) => anchorsFor(site, buoy.lights));
}

function groundOf(plan: ResortPlan): Ground {
  return { minX: 0, maxX: plan.tilesX * TILE_VOXELS, minZ: 0, maxZ: plan.tilesZ * TILE_VOXELS };
}

function bakeLighting(
  anchors: readonly LightAnchor[],
  claiming: readonly Placement[],
  ground: Ground,
): PreparedLighting | null {
  const reservation = lampReservationFor(ground, CATALOGUE_LIGHTS);
  const spec = lightGridSpecFor(anchors, gridBudgetFor(reservation), reservation);
  if (!spec) return null;
  const started = performance.now();
  const grid = bakeLightGrid(anchors, spec);
  const skyStarted = performance.now();
  bakeSkyVisibility({
    occluders: claiming.map(occluderOf).filter(occludes),
    spec,
    range: gridInterior(spec),
    direction: grid.direction,
  });
  const finished = performance.now();
  return {
    grid,
    bakeMs: Math.round(finished - started),
    skyBakeMs: Math.round(finished - skyStarted),
  };
}

function boundsOf(plan: ResortPlan, everything: readonly Placement[]): WorldBounds {
  if (everything.length === 0) return { ...groundOf(plan), height: 0 };
  return worldBoundsFor(everything, objectTypeTop);
}

export function prepareResort(request: PrepRequest): PreparedResort {
  const started = performance.now();
  const plan = planOf(request.source);
  const plot = layOut(plan, request.repeat);
  const everything = everythingOn(plot);
  const claiming = claimingOn(plot);
  const shore = shoreFor(plan);
  const moorings = mooringsFor(shore, plot.layout);
  const anchors = [...claiming, ...plot.rails]
    .flatMap((placement) => anchorsFor(placement, lightsOf(placement)))
    .concat(buoyLampsAt(moorings));
  const lighting = bakeLighting(anchors, claiming, groundOf(plan));
  const bounds = boundsOf(plan, everything);
  const framing = request.view
    ? benchFraming(request.view, bounds, CAMERA_FOV_DEGREES)
    : cameraFramingFor(bounds, CAMERA_FOV_DEGREES);
  // Framed exactly as the scene frames it, so this mesh matches the one the scene would build.
  const occupancy = createTileOccupancy(claimingOn(plot.layout));
  const surfaces = terrainSurfacesFor({
    terrain: terrainFor(plan),
    isClear: (x, z) => occupancy.keyAt({ x, z }) === undefined,
    shore,
    center: { x: framing.target.x, z: framing.target.z },
    reach: worldExtentOf(bounds) * TERRAIN_SPREAD,
    tileVoxels: TILE_VOXELS,
  });
  return {
    plan,
    plot,
    moorings,
    anchors,
    lighting,
    bounds,
    framing,
    surfaces,
    prepMs: Math.round(performance.now() - started),
  };
}

function surfaceBuffers(surface: SurfaceGeometry | null): ArrayBufferLike[] {
  if (!surface) return [];
  return [
    surface.positions.buffer,
    surface.indices.buffer,
    ...(surface.normals ? [surface.normals.buffer] : []),
    ...(surface.shoreDistances
      ? [surface.shoreDistances.edge.buffer, surface.shoreDistances.coast.buffer]
      : []),
  ];
}

// Each buffer only once: transferring the same buffer twice throws.
export function preparedTransferables(prepared: PreparedResort): ArrayBuffer[] {
  const { surfaces, lighting } = prepared;
  const buffers = new Set<ArrayBufferLike>([
    ...(lighting ? [lighting.grid.irradiance.buffer, lighting.grid.direction.buffer] : []),
    ...[surfaces.sea, surfaces.water, surfaces.ground.grass, surfaces.ground.sand]
      .concat(surfaces.risers.grass, surfaces.risers.sand)
      .flatMap(surfaceBuffers),
  ]);
  return [...buffers] as ArrayBuffer[];
}
