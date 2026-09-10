import { Color } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { ScratchRegion } from '../../voxel-world/domain/modelScratch';
import { srgbToLinear } from '../../lighting/domain/lightGrid';
import {
  buildModelAttributes,
  MISSING_COLOR,
  transferablesOf,
  type SectionMesh,
} from './modelAttributes';
import { planeAxes, type FaceAxis } from './greedyMesh';
import { VERTEX_FLOAT_STRIDE } from './vertexBuffer';

/** Builds a DVE-shaped interleaved vertex stream for one axis-aligned face. */
function sectionOf(
  materialId: string,
  origin: { x: number; y: number; z: number },
  faces: readonly { axis: FaceAxis; slice: number; u: number; v: number }[],
): SectionMesh {
  const vertices = new Float32Array(faces.length * 4 * VERTEX_FLOAT_STRIDE);
  const indices = new Uint32Array(faces.length * 6);
  faces.forEach((face, index) => {
    const { u, v } = planeAxes(face.axis);
    const corners: [number, number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([du, dv]) => {
      const point: [number, number, number] = [0, 0, 0];
      point[face.axis] = face.slice;
      point[u] = face.u + du!;
      point[v] = face.v + dv!;
      return point;
    });
    corners.forEach((point, corner) => {
      const base = (index * 4 + corner) * VERTEX_FLOAT_STRIDE;
      vertices[base] = point[0];
      vertices[base + 1] = point[1];
      vertices[base + 2] = point[2];
      vertices[base + 4 + face.axis] = 1;
    });
    const base = index * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], index * 6);
  });
  return { materialId, origin, vertices, vertexCount: faces.length * 4, indices };
}

const regions: ScratchRegion[] = [
  { id: 'path', x: 0, endX: 32 },
  { id: 'lamp', x: 64, endX: 96 },
];

const flat = (count: number): { axis: FaceAxis; slice: number; u: number; v: number }[] =>
  Array.from({ length: count }, (_, index) => ({ axis: 1 as FaceAxis, slice: 0, u: index, v: 0 }));

describe('buildModelAttributes', () => {
  it('returns one entry per region, in region order, even for models with no faces', () => {
    const models = buildModelAttributes({
      sections: [],
      regions,
      colorsByMaterialId: new Map(),
      emissiveByModelId: new Map(),
      waterByModelId: new Map(),
    });
    expect(models.map((model) => model.id)).toEqual(['path', 'lamp']);
    expect(models.every((model) => model.lit === null && model.emissive === null)).toBe(true);
  });

  it('rebases a section onto the model that owns it', () => {
    const models = buildModelAttributes({
      sections: [sectionOf('m1', { x: 64, y: 0, z: 0 }, flat(1))],
      regions,
      colorsByMaterialId: new Map([['m1', 0xffffff]]),
      emissiveByModelId: new Map(),
      waterByModelId: new Map(),
    });
    // The region starts at x = 64, so the face lands at the model's own origin.
    expect(Array.from(models[1]!.lit!.positions.slice(0, 3))).toEqual([0, 0, 0]);
    expect(models[0]!.lit).toBeNull();
  });

  it('merges coplanar faces of one colour', () => {
    const models = buildModelAttributes({
      sections: [sectionOf('m1', { x: 0, y: 0, z: 0 }, flat(8))],
      regions,
      colorsByMaterialId: new Map([['m1', 0x808080]]),
      emissiveByModelId: new Map(),
      waterByModelId: new Map(),
    });
    expect(models[0]!.unmergedTriangleCount).toBe(16);
    expect(models[0]!.triangleCount).toBe(2);
  });

  it('splits the colours a model declares emissive into their own geometry', () => {
    const models = buildModelAttributes({
      sections: [
        sectionOf('stone', { x: 0, y: 0, z: 0 }, flat(2)),
        sectionOf('glow', { x: 0, y: 4, z: 0 }, flat(2)),
      ],
      regions,
      colorsByMaterialId: new Map([
        ['stone', 0x404040],
        ['glow', 0xffee88],
      ]),
      emissiveByModelId: new Map([['path', new Set([0xffee88])]]),
      waterByModelId: new Map(),
    });
    expect(models[0]!.lit).not.toBeNull();
    expect(models[0]!.emissive).not.toBeNull();
    expect(models[0]!.triangleCount).toBe(4);
  });

  it('splits the colours a model declares water into a geometry of their own', () => {
    const models = buildModelAttributes({
      sections: [
        sectionOf('stone', { x: 0, y: 0, z: 0 }, flat(2)),
        sectionOf('pool', { x: 0, y: 4, z: 0 }, flat(3)),
      ],
      regions,
      colorsByMaterialId: new Map([
        ['stone', 0x404040],
        ['pool', 0x53b9c8],
      ]),
      emissiveByModelId: new Map(),
      waterByModelId: new Map([['path', new Set([0x53b9c8])]]),
    });
    expect(models[0]!.water).not.toBeNull();
    expect(models[0]!.emissive).toBeNull();
    // Two faces of stone and three of water, each pair merged into one quad.
    expect(models[0]!.lit!.triangleCount).toBe(2);
    expect(models[0]!.water!.triangleCount).toBe(2);
    expect(models[0]!.triangleCount).toBe(4);
  });

  it('leaves a colour lit unless the model that paints it asks otherwise', () => {
    const models = buildModelAttributes({
      sections: [sectionOf('pool', { x: 0, y: 0, z: 0 }, flat(1))],
      regions,
      colorsByMaterialId: new Map([['pool', 0x53b9c8]]),
      emissiveByModelId: new Map(),
      // The water is another model's; this one merely paints the same blue.
      waterByModelId: new Map([['lamp', new Set([0x53b9c8])]]),
    });
    expect(models[0]!.water).toBeNull();
    expect(models[0]!.lit).not.toBeNull();
  });

  it('paints an unregistered material the deliberate missing colour', () => {
    const models = buildModelAttributes({
      sections: [sectionOf('nope', { x: 0, y: 0, z: 0 }, flat(1))],
      regions,
      colorsByMaterialId: new Map(),
      emissiveByModelId: new Map(),
      waterByModelId: new Map(),
    });
    const [r, g, b] = models[0]!.lit!.colors;
    const missing = new Color(MISSING_COLOR);
    expect(r).toBeCloseTo(missing.r, 5);
    expect(g).toBeCloseTo(missing.g, 5);
    expect(b).toBeCloseTo(missing.b, 5);
  });

  it('refuses a section that belongs to no model', () => {
    expect(() =>
      buildModelAttributes({
        sections: [sectionOf('m1', { x: 9999, y: 0, z: 0 }, flat(1))],
        regions,
        colorsByMaterialId: new Map([['m1', 0xffffff]]),
        emissiveByModelId: new Map(),
        waterByModelId: new Map(),
      }),
    ).toThrow(/belongs to no model/);
  });

  it('writes the same linear colour Three.js would', () => {
    // The whole reason this module can run in a worker is that it converts
    // colours itself rather than through a `Color`. If the two ever part
    // company the resort changes shade, so they are pinned together here.
    for (const hex of [0x000000, 0x0a0a0a, 0x808080, 0xc3b189, 0xff00ff, 0xffffff]) {
      const three = new Color(hex);
      expect(srgbToLinear(((hex >> 16) & 0xff) / 255)).toBeCloseTo(three.r, 6);
      expect(srgbToLinear(((hex >> 8) & 0xff) / 255)).toBeCloseTo(three.g, 6);
      expect(srgbToLinear((hex & 0xff) / 255)).toBeCloseTo(three.b, 6);
    }
  });
});

describe('transferablesOf', () => {
  it('lists every buffer a worker would hand over', () => {
    const models = buildModelAttributes({
      sections: [
        sectionOf('stone', { x: 0, y: 0, z: 0 }, flat(2)),
        sectionOf('glow', { x: 0, y: 4, z: 0 }, flat(2)),
      ],
      regions,
      colorsByMaterialId: new Map([
        ['stone', 0x404040],
        ['glow', 0xffee88],
      ]),
      emissiveByModelId: new Map([['path', new Set([0xffee88])]]),
      waterByModelId: new Map(),
    });
    // Two geometries, four attributes each.
    expect(transferablesOf(models)).toHaveLength(8);
    expect(new Set(transferablesOf(models)).size).toBe(8);
  });

  it('has nothing to transfer for an empty catalogue', () => {
    expect(transferablesOf([])).toEqual([]);
  });
});
