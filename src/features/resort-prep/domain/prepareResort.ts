// Pure and renderer-free so it can run in a worker while the current resort keeps drawing.

import { ownedBounds, ownedSpan } from '../../land/domain/landRights';
import { BUOY_INDEX } from '../../../../voxel-gen/sea/index.ts';
import { benchFraming, type BenchStyles, type BenchView } from '../../bench/domain/benchConfig';
import { repeatPlot } from '../../bench/domain/plotRepeat';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { createTileOccupancy } from '../../build/domain/tileOccupancy';
import {
  hireOf,
  OBJECT_TYPES,
  objectTypeTop,
  ORIGINAL_TYPES,
  SEA_MODELS,
  TILE_VOXELS,
} from '../../catalog/domain/objectTypes';
import { mosaicDressing, mosaicKitOf } from '../../catalog/domain/mosaics';
import { lightsOf, occluderOf } from '../../catalog/domain/placementFacts';
import { MOSAIC_STYLES } from '../../../../voxel-gen/mosaics/index.ts';
import type { ModelHire } from '../../../../voxel-gen/voxelgen.ts';
import { layMosaic } from '../../layout/domain/mosaic';
import { ONE_OFF, styleMix } from '../../catalog/domain/styleMix';
import { clampConfig } from '../../layout/domain/resortConfig';
import {
  emptyResortPlan,
  generateResort,
  type GeneratorType,
  type ResortParams,
} from '../../layout/domain/resortGenerator';
import {
  keepStyle,
  layoutResort,
  tileKey,
  type Placement,
  type ResortLayout,
  type StyleOf,
} from '../../layout/domain/resortLayout';
import { RESORT_PLAN, type ResortPlan } from '../../layout/domain/resortPlan';
import { shoreFor, type Shore } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { levelHeight } from '../../layout/domain/elevation';
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
import type { RentalHut } from '../../sea/domain/fleets';
import { swimAreaMoorings, type Mooring } from '../../sea/domain/swimArea';
import { planOfWorld, type SavedWorld } from './savedWorld';

// Originals only: the generator stands every type at least once, so styles would double the plot.
const GENERATOR_TYPES: readonly GeneratorType[] = ORIGINAL_TYPES.map((type) => ({
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
  | { readonly kind: 'authored' }
  | { readonly kind: 'saved'; readonly world: SavedWorld };

export interface PrepRequest {
  readonly source: ResortSource;
  readonly repeat: number;
  readonly view: BenchView | null;
  readonly styles?: BenchStyles;
  readonly mosaic?: boolean;
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

// Every hut that hires craft out, in placement order, which is the order their fleets go in.
export function rentalsOf(
  shore: Shore | null,
  placements: readonly Placement[],
  hire: (id: string) => ModelHire | null,
): RentalHut[] {
  if (!shore) return [];
  return placements
    .filter((placement) => hire(placement.id) !== null)
    .map((hut) => ({
      x: (hut.tileX + hut.tilesX / 2) * TILE_VOXELS,
      z: (hut.tileZ + hut.tilesZ / 2) * TILE_VOXELS,
      key: hut.key,
      id: hut.id,
    }));
}

function planOf(source: ResortSource): ResortPlan {
  if (source.kind === 'authored') return RESORT_PLAN;
  if (source.kind === 'saved') return planOfWorld(source.world);
  const { tilesX, tilesZ, seed, land } = source.params;
  return source.kind === 'clear'
    ? emptyResortPlan(tilesX, tilesZ, seed, land)
    : generateResort(GENERATOR_TYPES, source.params);
}

const BENCH_ONE_OFF: { readonly [styles in BenchStyles]: number } = { mixed: ONE_OFF, scatter: 1 };

// The authored plot has no districts, so a bench mix falls back to render-chunk cells.
function benchStyleOf(styles: BenchStyles | undefined): StyleOf {
  if (!styles) return keepStyle;
  return styleMix({ seed: 1, neighbourhoods: [], oneOff: BENCH_ONE_OFF[styles] });
}

// Styled after the generator has run, which only ever sees originals, so its draws never move.
export function styleOfFor(request: PrepRequest, plan: ResortPlan): StyleOf {
  const { source } = request;
  if (source.kind === 'authored') return benchStyleOf(request.styles);
  if (source.kind !== 'generate' || clampConfig(source.params.config).variety === 'classic') {
    return keepStyle;
  }
  return styleMix({
    seed: source.params.seed,
    neighbourhoods: plan.neighbourhoods ?? [],
    oneOff: ONE_OFF,
  });
}

// A style per render chunk, cycled so neighbouring chunks differ and each draws its own pieces.
const MOSAIC_CELL_SHIFT = 4;

const mosaicByCell = (tileX: number, tileZ: number): string => {
  const cell = (tileX >> MOSAIC_CELL_SHIFT) + (tileZ >> MOSAIC_CELL_SHIFT);
  return MOSAIC_STYLES[cell % MOSAIC_STYLES.length]!.id;
};

type MosaicStyleAt = (tileX: number, tileZ: number) => string | null;

// Asked of the layout, since a monument's square is known only once it stands. A generated plot
// dresses its parks and monuments unless it is built classic; the authored one only for the bench.
function mosaicFor(
  request: PrepRequest,
  plan: ResortPlan,
): ((layout: ResortLayout) => MosaicStyleAt) | null {
  const { source } = request;
  if (source.kind === 'authored') return request.mosaic ? () => mosaicByCell : null;
  if (source.kind !== 'generate' || clampConfig(source.params.config).variety === 'classic') {
    return null;
  }
  return (layout) => mosaicDressing(plan, layout.placements, source.params.seed);
}

// The mosaic is laid before the lists are tiled, so the layout and the lists still hold the same
// placements in the same order.
function layOut(
  plan: ResortPlan,
  repeat: number,
  styleOf: StyleOf,
  mosaic: ((layout: ResortLayout) => MosaicStyleAt) | null,
): Plot {
  const catalogue = OBJECT_TYPES.map(layoutItemFor);
  const laid = layoutResort(catalogue, plan, styleOf);
  const layout = mosaic
    ? { ...laid, paths: layMosaic(laid.paths, mosaic(laid), mosaicKitOf(catalogue)) }
    : laid;
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

// The layout and the lists are the same placements in the same order, as a fresh plot's are,
// so the first build and every rebuild after an edit number nodes and seats alike. Each list is
// an array of its own, since the edit mode pushes and splices the plot's.
function plotOfWorld(world: SavedWorld): Plot {
  const { placements, props, paths, rails, tilesX, tilesZ } = world;
  return {
    layout: { placements, props, paths, rails, tilesX, tilesZ },
    placements: [...placements],
    props: [...props],
    paths: [...paths],
    rails: [...rails],
  };
}

// Paving is passed in so no buoy is moored in a pier: the sea lanes run jetty out through the line.
function mooringsFor(plan: ResortPlan, shore: Shore | null, layout: ResortLayout): Mooring[] {
  const paved = new Set(layout.paths.map((placement) => tileKey(placement.tileX, placement.tileZ)));
  return swimAreaMoorings({
    shore,
    rentals: rentalsOf(shore, layout.placements, hireOf),
    claimed: (tileX, tileZ) => paved.has(tileKey(tileX, tileZ)),
    span: ownedSpan(plan.land ?? null, plan),
  });
}

// A buoy never leaves its mooring, so its lamp can be baked like a street lamp's.
function buoyLampsAt(moorings: readonly Mooring[]): LightAnchor[] {
  const buoy = SEA_MODELS[BUOY_INDEX]!;
  return buoyLampSites(moorings, buoy, SEA_LEVEL).flatMap((site) => anchorsFor(site, buoy.lights));
}

// The land owned rather than the world: a 256-tile world lit whole would coarsen every lamp.
function groundOf(plan: ResortPlan): Ground {
  const owned = ownedBounds(plan.land ?? null, plan);
  return {
    minX: owned.x0 * TILE_VOXELS,
    maxX: (owned.x1 + 1) * TILE_VOXELS,
    minZ: owned.z0 * TILE_VOXELS,
    maxZ: (owned.z1 + 1) * TILE_VOXELS,
  };
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

// With land, the owned ground is always framed, so one hut does not shrink the view to itself.
// Without, unchanged, so the benchmark and a generated plot frame as they always have.
function boundsOf(plan: ResortPlan, everything: readonly Placement[]): WorldBounds {
  if (everything.length === 0) return { ...groundOf(plan), height: 0 };
  const standing = worldBoundsFor(everything, objectTypeTop);
  if (!plan.land) return standing;
  const owned = groundOf(plan);
  return {
    minX: Math.min(standing.minX, owned.minX),
    maxX: Math.max(standing.maxX, owned.maxX),
    minZ: Math.min(standing.minZ, owned.minZ),
    maxZ: Math.max(standing.maxZ, owned.maxZ),
    height: standing.height,
  };
}

export function prepareResort(request: PrepRequest): PreparedResort {
  const started = performance.now();
  const plan = planOf(request.source);
  const plot =
    request.source.kind === 'saved'
      ? plotOfWorld(request.source.world)
      : layOut(plan, request.repeat, styleOfFor(request, plan), mosaicFor(request, plan));
  const everything = everythingOn(plot);
  const claiming = claimingOn(plot);
  const shore = shoreFor(plan);
  const moorings = mooringsFor(plan, shore, plot.layout);
  const anchors = [...claiming, ...plot.rails]
    .flatMap((placement) => anchorsFor(placement, lightsOf(placement)))
    .concat(buoyLampsAt(moorings));
  const terrain = terrainFor(plan);
  const lit = { ...groundOf(plan), top: levelHeight(terrain.maxLevel) };
  const lighting = bakeLighting(anchors, claiming, lit);
  const bounds = boundsOf(plan, everything);
  const framing = request.view
    ? benchFraming(request.view, bounds, CAMERA_FOV_DEGREES)
    : cameraFramingFor(bounds, CAMERA_FOV_DEGREES);
  // Framed exactly as the scene frames it, so this mesh matches the one the scene would build.
  const occupancy = createTileOccupancy(claimingOn(plot.layout));
  const surfaces = terrainSurfacesFor({
    terrain,
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
