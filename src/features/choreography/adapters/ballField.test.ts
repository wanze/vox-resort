import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, type InstancedMesh } from 'three/webgpu';
import type { ModelGeometry } from '../../rendering/adapters/voxelMeshBuilder';
import type { DrawnBall } from '../domain/courts';
import { buildBallField } from './ballField';

function ballGeometry(id: string, size: number): ModelGeometry {
  const corners: number[] = [];
  for (const x of [0, size]) {
    for (const y of [0, size]) {
      for (const z of [0, size]) corners.push(x, y, z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(corners), 3));
  geometry.setIndex(
    new BufferAttribute(
      Uint16Array.from({ length: 36 }, (_, i) => i % 8),
      1,
    ),
  );
  return {
    id,
    lit: geometry,
    emissive: null,
    water: null,
    window: null,
    canopy: null,
    triangleCount: 12,
    unmergedTriangleCount: 12,
  };
}

const MODELS = [
  ballGeometry('ball-tennis', 1),
  ballGeometry('ball-volley', 2),
  ballGeometry('ball-basket', 2),
];

const ball = (model: string, x: number, shown = true): { ball: DrawnBall } => ({
  ball: { model, x, y: 3, z: 7, shown },
});

const meshOf = (field: ReturnType<typeof buildBallField>, id: string): InstancedMesh =>
  field.group.children.find((child) => child.name === `ball-${id}-lit`) as InstancedMesh;

const slot = (mesh: InstancedMesh, at: number): number[] =>
  Array.from(mesh.instanceMatrix.array.slice(at * 16, at * 16 + 16));

describe('buildBallField', () => {
  it('draws each kind of ball in one call, however many courts play with it', () => {
    const field = buildBallField({ models: MODELS, capacity: 4 });
    expect(field.drawCalls).toBe(3);
    expect(field.triangleCount).toBe(3 * 4 * 12);
    field.dispose();
  });

  it('stands each shown ball at its court, by its model', () => {
    const field = buildBallField({ models: MODELS, capacity: 2 });
    field.write([ball('ball-volley', 10), ball('ball-tennis', 20), ball('ball-volley', 30)]);
    const volley = meshOf(field, 'ball-volley');
    expect(slot(volley, 0).slice(12)).toEqual([10, 3, 7, 1]);
    expect(slot(volley, 1).slice(12)).toEqual([30, 3, 7, 1]);
    expect(slot(meshOf(field, 'ball-tennis'), 0)[12]).toBe(20);
    expect(slot(volley, 0)[0]).toBe(1);
    field.dispose();
  });

  it('packs out the slots of courts with no game, and of balls it has no room for', () => {
    const field = buildBallField({ models: MODELS, capacity: 2 });
    field.write([ball('ball-basket', 1), ball('ball-basket', 2)]);
    field.write([
      ball('ball-basket', 5, false),
      ball('ball-basket', 6),
      ball('ball-basket', 7),
      ball('ball-basket', 8),
      ball('ball-unknown', 9),
    ]);
    const basket = meshOf(field, 'ball-basket');
    expect(slot(basket, 0).slice(12)).toEqual([6, 3, 7, 1]);
    expect(slot(basket, 1).slice(12)).toEqual([7, 3, 7, 1]);
    field.write([]);
    for (const at of [0, 1]) expect(slot(basket, at)).toEqual([...Array(15).fill(0), 1]);
    field.dispose();
  });
});
