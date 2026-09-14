/**
 * Hand-authored voxel model harness.
 *
 * A model is a plain function that paints coloured cubes on an integer grid with
 * a {@link VoxelBuilder}. This module has no I/O and no engine imports, so the
 * app can import the same model files it renders previews from — the models are
 * the art, and there is exactly one copy of them.
 *
 * Conventions: **Y is up**; a voxel at `(x, y, z)` fills the unit cube
 * `[x, x+1]^3`; colours are packed `0xRRGGBB`; later writes to a cell win.
 * Coordinates start at the model's own corner, `y = 0` being ground level.
 *
 * Ported from the costa-sole `voxel-gen` tool; the GLB exporter it also carried
 * is gone, because objects reach the screen through the voxel pipeline in `src/`
 * rather than as glTF files.
 */

/** Packed colour, `0xRRGGBB`. */
export type Color = number;

/** Sparse voxel grid keyed by "x,y,z". Later writes to a cell win. */
export class VoxelBuilder {
  readonly voxels = new Map<string, Color>();

  set(x: number, y: number, z: number, c: Color): void {
    this.voxels.set(`${x},${y},${z}`, c);
  }

  del(x: number, y: number, z: number): void {
    this.voxels.delete(`${x},${y},${z}`);
  }

  /** Fill an inclusive integer box. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: Color): void {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) this.set(x, y, z, c);
      }
    }
  }
}

/**
 * The shelf of the build palette a model sits on.
 *
 * Which shelf an object belongs to is a fact about the art, not about the app,
 * so it is declared here with the rest of the model: a new model file lands in
 * the right group of the HUD without anything in `src/` being touched.
 */
export type ModelCategory =
  | 'grounds'
  | 'lodging'
  | 'amenities'
  | 'leisure'
  | 'people'
  | 'sky'
  | 'sea';

/**
 * Every category, with its heading, in the order the palette shows them.
 *
 * `people`, `sky` and `sea` are here for completeness and will never be shown:
 * all three live in registries of their own rather than in `models/index.ts`, so
 * no `OBJECT_TYPES` entry ever carries any of them and the palette drops the
 * empty shelves. None of them is something to place — a person walks in on their
 * own, a balloon is let go, and a boat is afloat on water nothing may stand on.
 * See `docs/crowd.md`, `features/balloons/` and `features/sea/`.
 */
export const MODEL_CATEGORIES: readonly {
  readonly id: ModelCategory;
  readonly label: string;
}[] = [
  { id: 'grounds', label: 'Grounds' },
  { id: 'lodging', label: 'Lodging' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'leisure', label: 'Leisure' },
  { id: 'people', label: 'People' },
  { id: 'sky', label: 'Sky' },
  { id: 'sea', label: 'Sea' },
];

/** Footprint in resort tiles; see `TILE_VOXELS` for the tile edge in voxels. */
export interface TileFootprint {
  readonly x: number;
  readonly z: number;
}

/**
 * A light the model emits, in the model's own coordinates.
 *
 * Declaring it here rather than in the scene keeps the art self-describing: a
 * street lamp knows where its bulb sits, so wherever the lamp is placed the
 * light lands in the right spot. Nothing is lit until the scene decides to —
 * during the day these are simply not instantiated.
 */
export interface ModelLight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Light colour, packed `0xRRGGBB`. */
  readonly color: Color;
  /** Three.js point-light intensity at full strength. */
  readonly intensity: number;
  /** Falloff distance in voxels. */
  readonly distance: number;
}

/**
 * Ground an object refuses to stand anywhere but on.
 *
 * - `beach`: sand at sea level that runs straight down to the sea — the beach,
 *   and not the dune behind it or a lawn.
 * - `shore`: the same, but within a few tiles of the water, for things that are
 *   *about* the water: a lifeguard tower, a pedalo rental.
 */
export type PlacementGround = 'beach' | 'shore';

/** Where, and how often, the resort is allowed to stand an object. */
export interface ModelPlacement {
  /** Absent means any dry, level ground will do. */
  readonly ground?: PlacementGround;
  /**
   * How many a generated resort stands: `min` on the smallest plot, growing to
   * `max` on a large one. Absent means as many as the districts draw.
   */
  readonly perResort?: { readonly min: number; readonly max: number };
}

/** Quarter turns about the vertical axis, in the renderer's own sense. */
export type QuarterTurns = 0 | 1 | 2 | 3;

/**
 * What a person does on a seat: sit up on it, or lie back on it.
 *
 * A fact about the furniture rather than about the person, which is why it is
 * declared here with the rest of the art: a bench is sat on and a sun lounger
 * is lain on, and no model has both. The crowd draws the pose from the seat it
 * walked to — see `crowd/adapters/crowdField.ts`, where both are one shader.
 */
export type SeatPose = 'sit' | 'lie';

/**
 * A place a person may sit, in the model's own coordinates.
 *
 * Here for the reason {@link ModelLight} is here: it is a fact about the art.
 * The bench knows where its own plank is and which way somebody on it looks, so
 * wherever the bench is put the sitter lands on the seat and faces out of it —
 * and a model that grows a second bench grows a second seat in the same edit,
 * with nothing in `src/` to change. See `crowd/domain/seating.ts`.
 *
 * `x` and `z` are the column the person's **hips** fill and `y` is the layer
 * they rest on, which is the first free layer above the seat — the same "first
 * free layer above" that `plinth` and `stuccoWall` hand back. It is the hips
 * rather than the feet because a seated person's feet are off the ground, and a
 * lying one has no feet on anything: what a seat fixes is where the body folds.
 * Everything else is worked out from there — see `crowd/adapters/crowdField.ts`.
 *
 * The hips are also the right anchor for a lounger, and not by luck: a figure
 * lain flat runs from four voxels behind the anchor to three in front of it, so
 * a mattress is drawn round the same point a cushion would be.
 */
export interface ModelSeat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * Quarter turns from the model's own +z that the person's **legs** point in.
   *
   * A figure faces +z — see `people/figure.ts` — so `0` is a seat whose sitter
   * looks the way the model does, which for a bench is out over its front edge.
   *
   * The legs rather than the eyes, because that is the half of it both poses
   * agree on: somebody sitting looks the way their legs point, and somebody
   * lying looks straight up with their legs down the lounger and their head at
   * the backrest. So a lounger's seat faces the **foot** end of its mattress.
   */
  readonly facing: QuarterTurns;
  /** Defaults to sitting, which is what all but the loungers do. */
  readonly pose?: SeatPose;
}

export interface VoxelModelSource {
  /** Stable identifier, used for the catalogue entry and the preview filename. */
  readonly id: string;
  /** Human readable name shown in the HUD. */
  readonly label: string;
  /** Which shelf of the build palette the object is offered on. */
  readonly category: ModelCategory;
  /** Tiles the object claims on the resort grid. */
  readonly tiles: TileFootprint;
  /**
   * Whether the ground under a tile decides where this object goes, so nobody
   * ever picks it: the build palette does not offer it, and the only things that
   * lay it are the layout and the paving tool.
   *
   * A flight of stairs is the case it exists for. Stairs are not a thing you
   * choose, they are what a path *becomes* where it climbs a terrace step —
   * chosen by hand they are a staircase up the middle of a lawn, and there is no
   * gesture that would have wanted one. Declaring it on the model rather than
   * listing the ids in the app keeps the rule with the art it is a fact about,
   * exactly as `LEVEL_VOXELS` is, so a second such paving needs no app change.
   */
  readonly groundDecides?: boolean;
  /**
   * Colours that glow: they are drawn unlit at full brightness instead of being
   * shaded, so a flame or a lamp head still reads as lit after dark.
   */
  readonly emissive?: readonly Color[];
  /**
   * Colours that are water: they are meshed apart from the rest of the model
   * and drawn with the sea's shader, so a pool ripples, glints and reflects the
   * sky exactly as the sea does. Everything else about them is ordinary — the
   * colour is still the albedo the shader starts from.
   */
  readonly water?: readonly Color[];
  /**
   * Colours that are window glass: shaded like any other surface by day, and
   * lit from inside after dark — half of them per building, drawn at random, so
   * no two buildings of one type show the same pattern of occupied rooms.
   *
   * Declared here rather than inferred from the palette because "this glass is
   * a window somebody lives behind" is a fact about the art: a lantern pane, a
   * bus shelter and a flume are all glass and none of them has a room behind
   * it. See `WINDOW_GLASS` in `parts/wall.ts` for what the buildings pass.
   *
   * Which windows are lit is decided on the GPU, from the pane and the instance
   * — see `rendering/adapters/instancedWorld.ts`. No light is cast on anything:
   * a window glows, it does not illuminate the street. A model that should
   * light its surroundings declares a {@link ModelLight} as well.
   */
  readonly windows?: readonly Color[];
  /** Point lights the object casts once the scene turns the lights on. */
  readonly lights?: readonly ModelLight[];
  /**
   * Where a person may sit on this object, if anywhere.
   *
   * Most of the catalogue declares none, and a seat nobody can reach is never
   * sat on rather than being an error — a chair in the middle of a lawn is a
   * chair nobody walks to. See `crowd/domain/walkNetwork.ts`.
   */
  readonly seats?: readonly ModelSeat[];
  /**
   * Where the object belongs, and how many of it a resort wants.
   *
   * A fact about the art for the reason `groundDecides` is: a volleyball court
   * is a beach court, and a pedalo rental hires boats to the bay, so the build
   * tool and the generator both read it here rather than keeping lists of ids.
   */
  readonly placement?: ModelPlacement;
  readonly build: (builder: VoxelBuilder) => void;
}

/** One painted voxel of a built model, in model-local coordinates. */
export interface PaintedVoxel {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: Color;
}

export interface VoxelModel {
  readonly id: string;
  readonly label: string;
  readonly category: ModelCategory;
  readonly tiles: TileFootprint;
  /** Whether the ground decides where this goes; see {@link VoxelModelSource}. */
  readonly groundDecides: boolean;
  /** Bounding box of the painted voxels, in voxels. */
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly voxels: readonly PaintedVoxel[];
  /** Glowing colours, deduplicated. */
  readonly emissive: readonly Color[];
  /** Colours drawn as water, deduplicated. */
  readonly water: readonly Color[];
  /** Window glass, deduplicated. */
  readonly windows: readonly Color[];
  /** Lights, shifted onto the same origin as the voxels. */
  readonly lights: readonly ModelLight[];
  /** Seats, shifted onto the same origin as the voxels, each with a pose. */
  readonly seats: readonly (ModelSeat & { readonly pose: SeatPose })[];
  /** Where the object belongs; empty when anywhere will do. */
  readonly placement: ModelPlacement;
}

/** Voxels along one tile edge — the scale every model is authored against. */
export const TILE_VOXELS = 16;

/**
 * Voxels one terrace of the resort stands above the one below it.
 *
 * Eight voxels is two metres: enough that a terrace reads as a terrace from the
 * height the plot is ever seen at, and shallow enough that one tile of stairs
 * climbs it in eight treads of one voxel rise by two of going.
 *
 * It lives here rather than in `src/` because it is a fact the art has to agree
 * with: the stair model is authored to climb exactly this far across one tile,
 * so a model and the ground it joins cannot drift apart. See `TILE_VOXELS`,
 * which is here for the same reason.
 */
export const LEVEL_VOXELS = 8;

/**
 * Voxels a paved tile's walking surface stands above the ground under it.
 *
 * `path.ts` and `boardwalk.ts` both fill their lowest two layers and nothing
 * above, so two is the top of a slab — and `stairs.ts` starts one tread above
 * that and ends one level higher, which is what makes a flight meet the paving
 * at both ends.
 *
 * Here for the same reason `TILE_VOXELS` and `LEVEL_VOXELS` are: it is a fact
 * the art has to agree with, and two separate things need it — the flight that
 * starts one tread above it, and, in `src/`, the crowd that walks on it.
 * Written down twice it is exactly the kind of number that drifts.
 */
export const PAVING_VOXELS = 2;

/**
 * Voxels a bridge's deck stands above the water it carries a path over.
 *
 * Six, which is {@link PAVING_VOXELS} plus a metre of rise, and that metre is
 * the whole difference between a bridge and a painted river. Inland water is
 * flush with its banks — see `layout/domain/terrain.ts` for why it is flush and
 * not dug — so a deck laid at the paving's own height is a path with blue under
 * it. Lifted, the span reads as a span from the side: you can see the water
 * running beneath it and the trestles standing in it.
 *
 * A metre rather than a terrace. `LEVEL_VOXELS` would be a humpback bridge, and
 * a river is two tiles wide, so the whole climb and fall would happen across 8 m
 * at a pitch no resort path has anywhere else on the plot.
 *
 * Here for the reason the other three are: several things have to agree with it
 * and none of them can read a number out of a model. `bridge.ts` lays its planks
 * at it, `bridge-ramp.ts` climbs to it in four treads, and in `src/` the crowd
 * walks on it. See `features/layout/domain/spans.ts`.
 */
export const BRIDGE_VOXELS = 6;

/** Declares a model. Pure data: nothing is built until {@link buildModel}. */
export function defineModel(source: VoxelModelSource): VoxelModelSource {
  return source;
}

/**
 * Runs a model's builder and normalises the result: voxels are shifted so the
 * model's bounding box starts at the origin, and come out in a stable order.
 */
export function buildModel(source: VoxelModelSource): VoxelModel {
  const builder = new VoxelBuilder();
  source.build(builder);
  if (builder.voxels.size === 0) throw new Error(`Model "${source.id}" painted no voxels`);

  const painted: PaintedVoxel[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [key, color] of builder.voxels) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    painted.push({ x, y, z, color });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const voxels = painted
    .map((voxel) => ({
      x: voxel.x - minX,
      y: voxel.y - minY,
      z: voxel.z - minZ,
      color: voxel.color,
    }))
    .toSorted((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

  return {
    id: source.id,
    label: source.label,
    category: source.category,
    tiles: source.tiles,
    groundDecides: source.groundDecides ?? false,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    depth: maxZ - minZ + 1,
    voxels,
    emissive: [...new Set(source.emissive ?? [])],
    water: [...new Set(source.water ?? [])],
    windows: [...new Set(source.windows ?? [])],
    // Lights ride along with the voxels, so they stay put when the model is
    // shifted onto its own origin.
    lights: (source.lights ?? []).map((light) => ({
      x: light.x - minX,
      y: light.y - minY,
      z: light.z - minZ,
      color: light.color,
      intensity: light.intensity,
      distance: light.distance,
    })),
    // Seats ride along for the same reason the lights do: a seat is a point on
    // the model, so it has to move with the model onto its own origin.
    seats: (source.seats ?? []).map((seat) => ({
      x: seat.x - minX,
      y: seat.y - minY,
      z: seat.z - minZ,
      facing: seat.facing,
      pose: seat.pose ?? 'sit',
    })),
    placement: source.placement ?? {},
  };
}
