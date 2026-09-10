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
export type ModelCategory = 'grounds' | 'lodging' | 'amenities' | 'leisure' | 'people';

/**
 * Every category, with its heading, in the order the palette shows them.
 *
 * `people` is here for completeness and will never be shown: the people live in
 * their own registry rather than in `models/index.ts`, so no `OBJECT_TYPES`
 * entry ever carries it and the palette drops the empty shelf. A person is not
 * something to place — they walk in on their own. See `docs/crowd.md`.
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
  /** Point lights the object casts once the scene turns the lights on. */
  readonly lights?: readonly ModelLight[];
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
  /** Lights, shifted onto the same origin as the voxels. */
  readonly lights: readonly ModelLight[];
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
  };
}
