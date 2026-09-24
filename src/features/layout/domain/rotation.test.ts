import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three/webgpu';
import type { ModelDoor, ModelLight } from '../../../../voxel-gen/voxelgen.ts';
import {
  normalizeRotation,
  rotateDoors,
  rotateExtent,
  rotateLights,
  rotatePoint,
  rotationRadians,
  ROTATIONS,
  swapsAxes,
  turnedOrigin,
  type Rotation,
} from './rotation';

const WIDTH = 32;
const DEPTH = 44;

describe('normalizeRotation', () => {
  it('leaves a turn that is already one of the four alone', () => {
    expect(ROTATIONS.map(normalizeRotation)).toEqual([0, 1, 2, 3]);
  });

  it('wraps past a full turn, in either direction', () => {
    expect(normalizeRotation(4)).toBe(0);
    expect(normalizeRotation(5)).toBe(1);
    expect(normalizeRotation(-1)).toBe(3);
    expect(normalizeRotation(-6)).toBe(2);
  });
});

describe('swapsAxes', () => {
  it('swaps on a quarter turn and not on a half one', () => {
    expect(ROTATIONS.map(swapsAxes)).toEqual([false, true, false, true]);
  });
});

describe('rotateExtent', () => {
  it("leaves an even turn's footprint as it was", () => {
    expect(rotateExtent(2, 3, 0)).toEqual({ x: 2, z: 3 });
    expect(rotateExtent(2, 3, 2)).toEqual({ x: 2, z: 3 });
  });

  it("swaps a quarter turn's footprint, so a 2x3 claims 3x2", () => {
    expect(rotateExtent(2, 3, 1)).toEqual({ x: 3, z: 2 });
    expect(rotateExtent(2, 3, 3)).toEqual({ x: 3, z: 2 });
  });

  it('is its own inverse for the axes it swaps', () => {
    for (const rotation of ROTATIONS) {
      const once = rotateExtent(2, 3, rotation);
      expect(rotateExtent(once.x, once.z, rotation)).toEqual({ x: 2, z: 3 });
    }
  });
});

function instanceMatrix(width: number, depth: number, rotation: Rotation): Matrix4 {
  const turned = rotateExtent(width, depth, rotation);
  const origin = turnedOrigin(turned.x, turned.z, rotation);
  return new Matrix4().makeRotationY(rotationRadians(rotation)).setPosition(origin.x, 0, origin.z);
}

// Rounded because the turn goes through a cosine; + 0 turns -0 into 0 for toEqual.
const send = (matrix: Matrix4, x: number, z: number): { x: number; z: number } => {
  const point = new Vector3(x, 0, z).applyMatrix4(matrix);
  return { x: Math.round(point.x) + 0, z: Math.round(point.z) + 0 };
};

describe('turnedOrigin', () => {
  it('leaves an unturned model where it was', () => {
    expect(turnedOrigin(WIDTH, DEPTH, 0)).toEqual({ x: 0, z: 0 });
  });

  it('keeps the turned model inside its own footprint, whichever way it turns', () => {
    for (const rotation of ROTATIONS) {
      const turned = rotateExtent(WIDTH, DEPTH, rotation);
      const matrix = instanceMatrix(WIDTH, DEPTH, rotation);
      const corners = [
        send(matrix, 0, 0),
        send(matrix, WIDTH, 0),
        send(matrix, 0, DEPTH),
        send(matrix, WIDTH, DEPTH),
      ];
      expect({
        rotation,
        minX: Math.min(...corners.map((corner) => corner.x)),
        minZ: Math.min(...corners.map((corner) => corner.z)),
        maxX: Math.max(...corners.map((corner) => corner.x)),
        maxZ: Math.max(...corners.map((corner) => corner.z)),
      }).toEqual({ rotation, minX: 0, minZ: 0, maxX: turned.x, maxZ: turned.z });
    }
  });
});

describe('rotatePoint', () => {
  it('leaves an unturned point alone', () => {
    expect(rotatePoint({ x: 7, z: 18 }, WIDTH, DEPTH, 0)).toEqual({ x: 7, z: 18 });
  });

  it("swings the model's north face round to face west", () => {
    expect(rotatePoint({ x: 0, z: 0 }, WIDTH, DEPTH, 1)).toEqual({ x: 0, z: WIDTH });
    expect(rotatePoint({ x: WIDTH, z: 0 }, WIDTH, DEPTH, 1)).toEqual({ x: 0, z: 0 });
  });

  it('agrees with the matrix the instance is drawn with', () => {
    for (const rotation of ROTATIONS) {
      const matrix = instanceMatrix(WIDTH, DEPTH, rotation);
      for (const point of [
        { x: 0, z: 0 },
        { x: 7, z: 18 },
        { x: WIDTH, z: DEPTH },
        { x: 30, z: 1 },
      ]) {
        expect({ rotation, point, at: rotatePoint(point, WIDTH, DEPTH, rotation) }).toEqual({
          rotation,
          point,
          at: send(matrix, point.x, point.z),
        });
      }
    }
  });

  it('brings a point back where it started after four turns', () => {
    let point = { x: 7, z: 18 };
    let width = WIDTH;
    let depth = DEPTH;
    for (let turn = 0; turn < 4; turn++) {
      point = rotatePoint(point, width, depth, 1);
      ({ x: width, z: depth } = rotateExtent(width, depth, 1));
    }
    expect(point).toEqual({ x: 7, z: 18 });
  });
});

const lamp = (overrides: Partial<ModelLight> = {}): ModelLight => ({
  x: 7,
  y: 18,
  z: 7,
  color: 0xffe3a3,
  intensity: 90,
  distance: 46,
  ...overrides,
});

describe('rotateLights', () => {
  it('hands an unturned model its own list back, rather than a copy of it', () => {
    const lights = [lamp()];
    expect(rotateLights(lights, WIDTH, DEPTH, 0)).toBe(lights);
  });

  it('moves a light to where the turned model puts it', () => {
    const [turned] = rotateLights([lamp()], WIDTH, DEPTH, 2);
    expect(turned).toMatchObject({ x: WIDTH - 7, z: DEPTH - 7 });
  });

  it('leaves the height, colour and reach of a light alone', () => {
    const [turned] = rotateLights([lamp()], WIDTH, DEPTH, 1);
    expect(turned).toMatchObject({ y: 18, color: 0xffe3a3, intensity: 90, distance: 46 });
  });

  it('has nothing to turn on a model that declares no light', () => {
    expect(rotateLights([], WIDTH, DEPTH, 3)).toEqual([]);
  });
});

describe('rotateDoors', () => {
  const north: ModelDoor = { x: WIDTH / 2, z: 0, facing: 2 };

  it('leaves a door on an unturned model where it was drawn', () => {
    const doors = [north];
    expect(rotateDoors(doors, WIDTH, DEPTH, 0)).toBe(doors);
  });

  it('puts the north door of a model turned once on its west wall, facing west', () => {
    const [turned] = rotateDoors([north], WIDTH, DEPTH, 1);
    expect(turned).toEqual({ x: 0, z: WIDTH / 2, facing: 3 });
  });

  it('brings a door back where it started, facing the same way, after four turns', () => {
    const side: ModelDoor = { x: WIDTH, z: 7, facing: 1 };
    let doors: readonly ModelDoor[] = [side];
    for (let turn = 0; turn < 4; turn++) {
      const size = rotateExtent(WIDTH, DEPTH, normalizeRotation(turn));
      doors = rotateDoors(doors, size.x, size.z, 1);
    }
    expect(doors).toEqual([side]);
  });

  it('hands a model with no doors its own empty list back', () => {
    const none: readonly ModelDoor[] = [];
    expect(rotateDoors(none, WIDTH, DEPTH, 3)).toBe(none);
  });
});
