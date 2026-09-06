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
  /** Tiles the object claims on the resort grid. */
  readonly tiles: TileFootprint;
  /**
   * Colours that glow: they are drawn unlit at full brightness instead of being
   * shaded, so a flame or a lamp head still reads as lit after dark.
   */
  readonly emissive?: readonly Color[];
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
  readonly tiles: TileFootprint;
  /** Bounding box of the painted voxels, in voxels. */
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly voxels: readonly PaintedVoxel[];
  /** Glowing colours, deduplicated. */
  readonly emissive: readonly Color[];
  /** Lights, shifted onto the same origin as the voxels. */
  readonly lights: readonly ModelLight[];
}

/** Voxels along one tile edge — the scale every model is authored against. */
export const TILE_VOXELS = 16;

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
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
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
    tiles: source.tiles,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    depth: maxZ - minZ + 1,
    voxels,
    emissive: [...new Set(source.emissive ?? [])],
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
