/**
 * Everything a new resort needs before anything is drawn, as one pure function.
 *
 * Growing a plot, laying it out, baking its lamps and its sky visibility and
 * meshing its terrain is seconds of work on a large plot — five on a 400-tile
 * one — and none of it touches the renderer. So it is gathered here, where it
 * can run in a worker (`adapters/prepWorker.ts`) while the resort already on
 * screen keeps drawing, and what comes back is plain objects and typed arrays
 * the main thread only has to wrap: instance buffers, textures, meshes.
 *
 * The helpers the main thread also needs once a resort is standing — which
 * lamps an object carries, what box it takes sky away with — live here too, so
 * the bake and the edits that keep it current can never disagree about them.
 */

import type { ModelLight } from '../../../../voxel-gen/voxelgen.ts';
import { BUOY_INDEX } from '../../../../voxel-gen/sea/index.ts';
import { benchFraming, type BenchView } from '../../bench/domain/benchConfig';
import { repeatPlot } from '../../bench/domain/plotRepeat';
import { layoutItemFor } from '../../build/domain/buildPlan';
import { createTileOccupancy } from '../../build/domain/tileOccupancy';
import {
  OBJECT_TYPES,
  objectTypeById,
  objectTypeTop,
  SEA_MODELS,
  TILE_VOXELS,
} from '../../catalog/domain/objectTypes';
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
import { rotateLights } from '../../layout/domain/rotation';
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
import { bakeSkyVisibility, occludes, type Occluder } from '../../lighting/domain/skyVisibility';
import {
  SEA_LEVEL,
  TERRAIN_SPREAD,
  terrainSurfacesFor,
  type SurfaceGeometry,
  type TerrainSurfaces,
} from '../../rendering/domain/terrainSurface';
import { buoyLampSites } from '../../sea/domain/buoyLamps';
import { swimAreaMoorings, type Mooring, type Rental } from '../../sea/domain/swimArea';

/** The catalogue as the generator needs to see it: footprints and shelves. */
const GENERATOR_TYPES: readonly GeneratorType[] = OBJECT_TYPES.map((type) => ({
  id: type.id,
  category: type.category,
  tilesX: type.model.tiles.x,
  tilesZ: type.model.tiles.z,
}));

/** Every light the catalogue declares, whether or not one is standing yet. */
const CATALOGUE_LIGHTS = OBJECT_TYPES.flatMap((type) => type.model.lights);

/**
 * How solidly each model fills its own bounding box, 0..1.
 *
 * The sky-visibility bake shades from boxes, and a box is a poor stand-in for a
 * street lamp: scaling its contribution by what the model actually fills is what
 * keeps a pole from shading like a pillar. Derived from the catalogue, so an
 * object added to the art needs no rule written for it here.
 */
const DENSITY_PER_TYPE = new Map(
  OBJECT_TYPES.map((type) => [
    type.id,
    type.model.voxels.length / Math.max(1, type.model.width * type.model.height * type.model.depth),
  ]),
);

/** Where a new resort comes from. */
export type ResortSource =
  | { readonly kind: 'generate'; readonly params: ResortParams }
  /** Bare ground of this size — a coast, a hill and a river off it. See `emptyResortPlan`. */
  | { readonly kind: 'clear'; readonly params: ResortParams }
  /** The hand-authored plan, which is the one a benchmark measures. */
  | { readonly kind: 'authored' };

export interface PrepRequest {
  readonly source: ResortSource;
  /** Tiles the plot this many times a side, to price a larger resort; see `plotRepeat.ts`. */
  readonly repeat: number;
  /** The benchmark preset the camera is pinned to, or null to frame the plot. */
  readonly view: BenchView | null;
}

export interface Plot {
  readonly layout: ResortLayout;
  /** Authored objects: what the generator laid out, and what the pointer adds. */
  readonly placements: Placement[];
  /** Lamps and hedges the layout scattered along the paths. */
  readonly props: Placement[];
  /** One placement per paved tile. */
  readonly paths: Placement[];
  /** Handrails, standing on the paving they guard rather than on ground of their own. */
  readonly rails: Placement[];
}

export interface PreparedLighting {
  /**
   * The lamps baked into three channels of the grid, and the sky visibility
   * into the fourth: `direction`'s alpha already holds it.
   */
  readonly grid: BakedLightGrid;
  /** Milliseconds both bakes took together. */
  readonly bakeMs: number;
  /** Milliseconds the sky-visibility pass took, of `bakeMs`. */
  readonly skyBakeMs: number;
}

export interface PreparedResort {
  readonly plan: ResortPlan;
  readonly plot: Plot;
  /** Where the bay's buoys are moored, which their lamps were baked at. */
  readonly moorings: readonly Mooring[];
  /** Every lamp the bake lit: the plot's, the rails' and the buoys'. */
  readonly anchors: readonly LightAnchor[];
  /** The baked volume, or null when nothing in the catalogue casts light. */
  readonly lighting: PreparedLighting | null;
  readonly bounds: WorldBounds;
  readonly framing: CameraFraming;
  /** The terrain meshed for this plot as it was grown, framed where the camera is. */
  readonly surfaces: TerrainSurfaces;
  /** Milliseconds all of this took, wherever it ran. */
  readonly prepMs: number;
}

/** Objects, scattered props, path tiles and rails: everything the scene draws. */
export function everythingOn(plot: Plot): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths, ...plot.rails];
}

/**
 * Everything that claims a tile of the plot.
 *
 * Everything the scene draws, less the handrails: a rail stands on the paving it
 * guards, so the tile under it is the slab's, and the three things that ask what
 * is standing on a tile — the occupancy index, the shadows and the sky-visibility
 * bake — would all get the wrong answer from it.
 */
export function claimingOn(
  plot: Pick<Plot, 'placements' | 'props' | 'paths'> | ResortLayout,
): Placement[] {
  return [...plot.placements, ...plot.props, ...plot.paths];
}

/**
 * The lights an object carries, moved to where the way it stands puts them.
 *
 * The model's own size is what the turn is measured against, so this reads the
 * catalogue rather than the placement: a placement's extent is already turned,
 * and turning a light against it would send it out of the lantern it was
 * declared in.
 */
export function lightsOf(placement: Placement): readonly ModelLight[] {
  const { model } = objectTypeById(placement.id);
  return rotateLights(model.lights, model.width, model.depth, placement.rotation);
}

/**
 * The box an object stands in, as far as the sky behind it is concerned.
 *
 * The placement's own extents, which are already turned, and the model's height
 * standing on its own terrace. A path slab comes out two voxels tall and is
 * dropped by the bake itself; see `MIN_OCCLUDER_HEIGHT`.
 */
export function occluderOf(placement: Placement): Occluder {
  return {
    key: placement.key,
    minX: placement.x,
    maxX: placement.x + placement.width,
    minY: placement.y,
    maxY: placement.y + objectTypeTop(placement.id),
    minZ: placement.z,
    maxZ: placement.z + placement.depth,
    density: DENSITY_PER_TYPE.get(placement.id) ?? 1,
  };
}

/**
 * The hire hut the bay lets boats out from: the middle of its whole footprint,
 * which is the column its boats come in on. Null on a plot with no sea or no
 * hut — the generator stands exactly one, and only on sand.
 */
export function rentalOf(shore: Shore | null, placements: readonly Placement[]): Rental | null {
  if (!shore) return null;
  const hut = placements.find((placement) => placement.id === PEDALO_RENTAL_ID);
  if (!hut) return null;
  return {
    x: (hut.tileX + hut.tilesX / 2) * TILE_VOXELS,
    z: (hut.tileZ + hut.tilesZ / 2) * TILE_VOXELS,
  };
}

/** The plan a source grows. */
function planOf(source: ResortSource): ResortPlan {
  if (source.kind === 'authored') return RESORT_PLAN;
  const { tilesX, tilesZ, seed } = source.params;
  return source.kind === 'clear'
    ? emptyResortPlan(tilesX, tilesZ, seed)
    : generateResort(GENERATOR_TYPES, source.params);
}

/** Lays a plan out, and tiles it when a benchmark asks for a bigger one. */
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

/**
 * Where the bay's buoys are moored. The paving is passed in so no buoy is moored
 * in a pier: the sea lanes run six tiles of jetty out through the line.
 */
function mooringsFor(shore: Shore | null, layout: ResortLayout): Mooring[] {
  const paved = new Set(layout.paths.map((placement) => tileKey(placement.tileX, placement.tileZ)));
  return swimAreaMoorings({
    shore,
    rental: rentalOf(shore, layout.placements),
    claimed: (tileX, tileZ) => paved.has(tileKey(tileX, tileZ)),
  });
}

/**
 * The lamps on the buoys' masts, baked at their moorings: a buoy does not leave
 * its mooring, so its lamp is as static as a street lamp's.
 */
function buoyLampsAt(moorings: readonly Mooring[]): LightAnchor[] {
  const buoy = SEA_MODELS[BUOY_INDEX]!;
  return buoyLampSites(moorings, buoy, SEA_LEVEL).flatMap((site) => anchorsFor(site, buoy.lights));
}

/**
 * The ground a lamp could be stood on: the plan's own extent, in voxels — which
 * the grid is sized from, so it covers the tiles nothing stands on yet.
 */
function groundOf(plan: ResortPlan): Ground {
  return { minX: 0, maxX: plan.tilesX * TILE_VOXELS, minZ: 0, maxZ: plan.tilesZ * TILE_VOXELS };
}

/**
 * Bakes every lamp into a volume sized for the whole plot, then the sky
 * visibility into its fourth channel. See `lighting/domain/lightGrid.ts`.
 */
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

/**
 * How much ground the resort covers, measured from what is standing — except on
 * a bare plot, where the plan's own extent is the only answer.
 */
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
  // Framed and reached exactly as the scene frames and reaches it, so the mesh
  // made here is the mesh the scene would have made; see `threeScene.ts`. What
  // stands on the ground is asked of the layout's own lists: the terrain is the
  // plan's, and a benchmark's tiled copies share their original's tiles.
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

/** Every typed array a surface holds. */
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

/**
 * Every buffer a prepared resort can hand over rather than copy: tens of
 * megabytes of baked volume and terrain. Each named once, since a buffer listed
 * twice is an error to transfer.
 */
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
