import { describe, expect, it } from 'vitest';
import { Matrix4, OrthographicCamera } from 'three/webgpu';
import { ANCHOR_REACH, grabsAnchor, tileOnScreen } from './touchAnchor';
import { pickTile } from './groundPick';

const VIEWPORT = { width: 800, height: 400 };

// Looking straight down on the origin, 200 voxels across and 100 deep.
function topDownCamera(): Matrix4 {
  const camera = new OrthographicCamera(-100, 100, 50, -50, 0.1, 500);
  camera.position.set(0, 100, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

describe('tileOnScreen', () => {
  it('puts a tile at the centre of the view where the camera looks', () => {
    const point = tileOnScreen({ x: 0, z: 0 }, 0, VIEWPORT, topDownCamera().elements, 2);
    expect(point!.x).toBeCloseTo(404);
    expect(point!.y).toBeCloseTo(204);
  });

  it('agrees with picking: the point it gives picks the same tile back', () => {
    const viewProjection = topDownCamera();
    const inverse = viewProjection.clone().invert();
    const tile = { x: 7, z: -5 };
    const point = tileOnScreen(tile, 0, VIEWPORT, viewProjection.elements, 4)!;
    expect(pickTile(point, VIEWPORT, inverse.elements, 4)).toEqual(tile);
  });

  it('has no point for a tile behind the eye', () => {
    const behind = Array.from({ length: 16 }, (_, at) => (at === 15 ? -1 : 0));
    expect(tileOnScreen({ x: 0, z: 0 }, 0, VIEWPORT, behind)).toBeNull();
  });
});

describe('grabsAnchor', () => {
  const anchor = { x: 100, y: 100 };

  it('grabs on the anchor itself, however far its centre is', () => {
    expect(grabsAnchor(anchor, { x: 400, y: 300 }, true)).toBe(true);
  });

  it('grabs within a fingertip of the centre, and not beyond it', () => {
    expect(grabsAnchor(anchor, { x: 100 + ANCHOR_REACH, y: 100 }, false)).toBe(true);
    expect(grabsAnchor(anchor, { x: 100 + ANCHOR_REACH + 1, y: 100 }, false)).toBe(false);
  });

  it('never grabs without an anchor', () => {
    expect(grabsAnchor(null, anchor, false)).toBe(false);
  });
});
