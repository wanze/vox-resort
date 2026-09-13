import { describe, expect, it } from 'vitest';
import { materialKeyFor, voxelIdFor } from '../../catalog/domain/materials';
import {
  allMaterials,
  materialColorsById,
  OBJECT_TYPES,
  PAINTED_MODELS,
  PEOPLE_MODELS,
} from '../../catalog/domain/objectTypes';
import { deinterleaveVertices, flipWinding } from '../../rendering/domain/vertexBuffer';
import { scratchLayoutFor } from '../domain/modelScratch';
import { buildSectionMeshes, DEFAULT_WORLD_SCALE, sectionSizeOf } from './dveEngine';

/** One vertex of a triangle, read out of a de-interleaved attribute array. */
const corner = (index: number, source: Float32Array): readonly number[] => [
  source[index * 3]!,
  source[index * 3 + 1]!,
  source[index * 3 + 2]!,
];

/**
 * The one test that touches the engine: it catches registration drift, where a
 * model paints a material the DVE registry never heard of and the mesher
 * silently drops or mis-colours those faces.
 *
 * It meshes {@link PAINTED_MODELS} rather than the catalogue, which is the whole
 * point: the crowd is a second registry, and the `skin` family is painted by
 * nothing else on the plot. Derived from `OBJECT_TYPES` alone the material would
 * never be registered, and this is where that has to be loud.
 */
describe('buildSectionMeshes', () => {
  it('meshes the catalogue and the crowd into submeshes of known materials', async () => {
    const scratch = scratchLayoutFor(
      PAINTED_MODELS,
      (color) => voxelIdFor(materialKeyFor(color)),
      sectionSizeOf(DEFAULT_WORLD_SCALE),
    );
    // Every person has a region of their own, exactly as every object does.
    const meshed = new Set(scratch.regions.map((region) => region.id));
    for (const person of PEOPLE_MODELS) expect(meshed.has(person.id), person.id).toBe(true);
    expect(scratch.extentX).toBeLessThanOrEqual(DEFAULT_WORLD_SCALE.horizontalExtent);
    const writes = scratch.writes;

    const sections = await buildSectionMeshes(allMaterials(), writes);
    const colors = materialColorsById();

    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(colors.has(section.materialId)).toBe(true);
      expect(section.vertexCount).toBeGreaterThan(0);
      expect(section.indices.length % 3).toBe(0);
    }
    // Face culling has to remove the interiors: unmeshed, the catalogue's
    // voxels would each contribute twelve triangles rather than a handful.
    const triangles = sections.reduce((total, section) => total + section.indices.length / 3, 0);
    expect(triangles).toBeLessThan(writes.voxelIds.length * 4);
  }, 30_000);

  it('emits faces that point outwards once their winding is flipped', async () => {
    // DVE keeps its world in module-level statics, so park this voxel well past
    // the scratch regions the test above painted into the same world.
    const writes = {
      positions: Int32Array.of(6000, 100, 1000),
      voxelIds: Uint16Array.of(0),
      palette: [voxelIdFor(materialKeyFor(OBJECT_TYPES[0]!.color))],
    };
    const [section] = await buildSectionMeshes(allMaterials(), writes);
    expect(section).toBeDefined();

    const { positions, normals } = deinterleaveVertices(section!.vertices, section!.vertexCount);
    const indices = flipWinding(section!.indices);

    expect(indices.length / 3).toBe(12); // a lone voxel keeps all six faces
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const [a, b, c] = [
        corner(indices[triangle]!, positions),
        corner(indices[triangle + 1]!, positions),
        corner(indices[triangle + 2]!, positions),
      ];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      // Counter-clockwise winding, the front face for Three.js, puts the
      // cross product on the same side as the vertex normal.
      const cross = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const normal = corner(indices[triangle]!, normals);
      const facing = cross[0]! * normal[0]! + cross[1]! * normal[1]! + cross[2]! * normal[2]!;
      expect(facing).toBeGreaterThan(0);
    }
  }, 30_000);
});
