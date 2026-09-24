import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { groundPointAt } from '../../build/domain/groundPick';
import { PICK_PIXELS, pickPerson, type PickablePeople } from './pickPerson';

const VIEWPORT = { width: 800, height: 400 };
const AIM = 6;

const camera = (): PerspectiveCamera => {
  const eye = new PerspectiveCamera(50, VIEWPORT.width / VIEWPORT.height, 1, 2000);
  eye.position.set(0, 100, 100);
  eye.lookAt(0, 0, 0);
  eye.updateMatrixWorld();
  eye.updateProjectionMatrix();
  return eye;
};

const viewProjectionOf = (eye: PerspectiveCamera): Matrix4 =>
  new Matrix4().multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse);

const screenOf = (eye: PerspectiveCamera, x: number, y: number, z: number) => {
  const ndc = new Vector3(x, y, z).project(eye);
  return { x: ((ndc.x + 1) / 2) * VIEWPORT.width, y: ((1 - ndc.y) / 2) * VIEWPORT.height };
};

const peopleAt = (...feet: readonly (readonly [number, number, number])[]): PickablePeople => ({
  count: feet.length,
  x: Float32Array.from(feet, (point) => point[0]),
  y: Float32Array.from(feet, (point) => point[1]),
  z: Float32Array.from(feet, (point) => point[2]),
});

describe('pickPerson', () => {
  const eye = camera();
  const matrix = viewProjectionOf(eye).elements;

  it('picks the person the pointer is on', () => {
    const people = peopleAt([-30, 0, 10], [12, 0, -4], [40, 0, 20]);
    const pointer = screenOf(eye, 12, AIM, -4);
    expect(pickPerson(pointer, VIEWPORT, matrix, people, AIM)).toBe(1);
  });

  it('picks nobody when the pointer is far from everybody', () => {
    const people = peopleAt([-30, 0, 10], [12, 0, -4]);
    expect(pickPerson({ x: 5, y: 5 }, VIEWPORT, matrix, people, AIM)).toBe(-1);
  });

  it('picks the person in front, not the one standing where the ground ray lands', () => {
    const front: [number, number, number] = [0, 0, 20];
    const pointer = screenOf(eye, front[0], front[1] + AIM, front[2]);
    const ground = groundPointAt(pointer, VIEWPORT, viewProjectionOf(eye).invert().elements);
    expect(ground).not.toBeNull();
    expect(ground!.z).toBeLessThan(front[2] - 4);
    const people = peopleAt([ground!.x, 0, ground!.z], front);
    expect(pickPerson(pointer, VIEWPORT, matrix, people, AIM)).toBe(1);
  });

  it('never picks somebody behind the camera', () => {
    const people = peopleAt([0, 150 - AIM, 150]);
    const centre = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
    expect(pickPerson(centre, VIEWPORT, matrix, people, AIM, 1000)).toBe(-1);
  });

  it('picks nobody out of nobody', () => {
    expect(pickPerson({ x: 400, y: 200 }, VIEWPORT, matrix, peopleAt(), AIM)).toBe(-1);
  });

  it('hits just inside the reach and misses just outside it', () => {
    const people = peopleAt([0, 0, 0]);
    const on = screenOf(eye, 0, AIM, 0);
    const reach = 10;
    expect(
      pickPerson({ x: on.x + reach - 0.5, y: on.y }, VIEWPORT, matrix, people, AIM, reach),
    ).toBe(0);
    expect(
      pickPerson({ x: on.x, y: on.y - reach - 0.5 }, VIEWPORT, matrix, people, AIM, reach),
    ).toBe(-1);
    expect(
      pickPerson({ x: on.x + PICK_PIXELS - 0.5, y: on.y }, VIEWPORT, matrix, people, AIM),
    ).toBe(0);
    expect(
      pickPerson({ x: on.x + PICK_PIXELS + 0.5, y: on.y }, VIEWPORT, matrix, people, AIM),
    ).toBe(-1);
  });

  it('breaks a tie to the lower index, every time', () => {
    const people = peopleAt([30, 0, 30], [5, 0, 5], [5, 0, 5]);
    const pointer = screenOf(eye, 5, AIM, 5);
    expect(pickPerson(pointer, VIEWPORT, matrix, people, AIM)).toBe(1);
    expect(pickPerson(pointer, VIEWPORT, matrix, people, AIM)).toBe(1);
  });

  it('rejects a matrix that is not 4x4', () => {
    expect(() => pickPerson({ x: 0, y: 0 }, VIEWPORT, [1, 0, 0, 1], peopleAt(), AIM)).toThrow(
      /16 elements/,
    );
  });
});
