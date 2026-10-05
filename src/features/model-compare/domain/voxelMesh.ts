// Merged per colour, as the game's mesher merges, so the triangle count is one the two
// takes can be compared on.

import { dayVoxelsOf, type VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import { greedyMesh, quadCorners, quadNormal } from '../../rendering/domain/greedyMesh';

export interface SurfaceMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
}

export type SurfaceKind = 'lit' | 'emissive' | 'water';

export interface VoxelMesh {
  readonly surfaces: Readonly<Record<SurfaceKind, SurfaceMesh | null>>;
  readonly triangleCount: number;
}

const SIDES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

interface Soup {
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
}

interface PaintedSoup extends Soup {
  readonly colors: number[];
}

const emptySoup = (): PaintedSoup => ({ positions: [], normals: [], indices: [], colors: [] });

// Any two triangles covering the unit face will do: the merger reads cells off their bounding boxes.
function pushFace(soup: Soup, x: number, y: number, z: number, side: (typeof SIDES)[number]): void {
  const axis = side.findIndex((component) => component !== 0);
  const origin = [x, y, z];
  if (side[axis]! > 0) origin[axis]! += 1;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const base = soup.positions.length / 3;
  for (const [du, dv] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const) {
    const corner = [...origin];
    corner[u]! += du;
    corner[v]! += dv;
    soup.positions.push(...corner);
    soup.normals.push(...side);
  }
  soup.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function kindOf(model: VoxelModel, color: number): SurfaceKind {
  if (model.emissive.includes(color)) return 'emissive';
  if (model.water.includes(color)) return 'water';
  return 'lit';
}

function toSurface(soup: PaintedSoup): SurfaceMesh | null {
  if (soup.indices.length === 0) return null;
  return {
    positions: Float32Array.from(soup.positions),
    normals: Float32Array.from(soup.normals),
    colors: Float32Array.from(soup.colors),
    indices: Uint32Array.from(soup.indices),
  };
}

export function meshVoxelModel(model: VoxelModel): VoxelMesh {
  const voxels = dayVoxelsOf(model);
  const filled = new Set(voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
  const byColor = new Map<number, Soup>();
  for (const voxel of voxels) {
    for (const side of SIDES) {
      if (filled.has(`${voxel.x + side[0]},${voxel.y + side[1]},${voxel.z + side[2]}`)) continue;
      let soup = byColor.get(voxel.color);
      if (!soup) byColor.set(voxel.color, (soup = { positions: [], normals: [], indices: [] }));
      pushFace(soup, voxel.x, voxel.y, voxel.z, side);
    }
  }

  const merged: Record<SurfaceKind, PaintedSoup> = {
    lit: emptySoup(),
    emissive: emptySoup(),
    water: emptySoup(),
  };
  let triangleCount = 0;
  for (const [color, soup] of byColor) {
    const { quads } = greedyMesh({
      positions: Float32Array.from(soup.positions),
      normals: Float32Array.from(soup.normals),
      indices: soup.indices,
    });
    const target = merged[kindOf(model, color)];
    const rgb = linearRgbOf(color);
    for (const quad of quads) {
      const base = target.positions.length / 3;
      const normal = quadNormal(quad);
      for (const corner of quadCorners(quad)) {
        target.positions.push(...corner);
        target.normals.push(...normal);
        target.colors.push(...rgb);
      }
      target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    triangleCount += quads.length * 2;
  }

  return {
    surfaces: {
      lit: toSurface(merged.lit),
      emissive: toSurface(merged.emissive),
      water: toSurface(merged.water),
    },
    triangleCount,
  };
}
