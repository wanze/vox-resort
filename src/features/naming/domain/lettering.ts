import type { ModelNameplate } from '../../../../voxel-gen/voxelgen.ts';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import type { MeshAttributes } from '../../rendering/domain/modelAttributes';
import type { SetLine } from './signFont';

type Vec3 = readonly [number, number, number];

interface Run {
  readonly row: number;
  readonly from: number;
  readonly to: number;
}

function runsOf(line: SetLine): readonly Run[] {
  const runs: Run[] = [];
  for (let row = 0; row < line.height; row++) {
    let from = -1;
    for (let column = 0; column <= line.width; column++) {
      const set = column < line.width && line.cells[row * line.width + column] === 1;
      if (set && from < 0) from = column;
      if (!set && from >= 0) {
        runs.push({ row, from, to: column });
        from = -1;
      }
    }
  }
  return runs;
}

// Never coarser than the world's own voxel, and finer for a name too long to fit at that.
export function pixelOf(line: SetLine, plate: ModelNameplate): number {
  const width = plate.x1 - plate.x0 + 1;
  const height = plate.y1 - plate.y0 + 1;
  return Math.min(1, width / Math.max(1, line.width), height / line.height);
}

class Quads {
  readonly positions: number[] = [];
  readonly normals: number[] = [];

  // u × v points along the normal, so the quad winds counter-clockwise seen from outside.
  add(corner: Vec3, u: Vec3, v: Vec3, normal: Vec3): void {
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      this.positions.push(
        corner[0] + u[0] * a + v[0] * b,
        corner[1] + u[1] * a + v[1] * b,
        corner[2] + u[2] * a + v[2] * b,
      );
      this.normals.push(...normal);
    }
  }
}

// No back: it stands against the board and would never be seen.
function addBlock(quads: Quads, min: Vec3, max: Vec3, outward: 1 | -1): void {
  const [dx, dy, dz] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const X: Vec3 = [dx, 0, 0];
  const Y: Vec3 = [0, dy, 0];
  const Z: Vec3 = [0, 0, dz];
  if (outward === 1) quads.add([min[0], min[1], max[2]], X, Y, [0, 0, 1]);
  else quads.add(min, Y, X, [0, 0, -1]);
  quads.add([min[0], max[1], min[2]], Z, X, [0, 1, 0]);
  quads.add(min, X, Z, [0, -1, 0]);
  quads.add([max[0], min[1], min[2]], Y, Z, [1, 0, 0]);
  quads.add(min, Z, Y, [-1, 0, 0]);
}

// In the model's own voxels. A face looked at from -z is set mirrored, so it reads left to
// right from where it is seen.
export function letteringFor(line: SetLine, plate: ModelNameplate): MeshAttributes {
  const pixel = pixelOf(line, plate);
  const width = plate.x1 - plate.x0 + 1;
  const height = plate.y1 - plate.y0 + 1;
  const left = plate.x0 + (width - line.width * pixel) / 2;
  const right = left + line.width * pixel;
  const bottom = plate.y0 + (height - line.height * pixel) / 2;
  const runs = runsOf(line);
  const quads = new Quads();
  for (const { surface, outward } of plate.faces) {
    const [near, far] =
      outward === 1 ? [surface + 1, surface + 1 + pixel] : [surface - pixel, surface];
    for (const run of runs) {
      const x0 = outward === 1 ? left + run.from * pixel : right - run.to * pixel;
      const y0 = bottom + (line.height - 1 - run.row) * pixel;
      addBlock(quads, [x0, y0, near], [x0 + (run.to - run.from) * pixel, y0 + pixel, far], outward);
    }
  }
  const vertexCount = quads.positions.length / 3;
  const [r, g, b] = linearRgbOf(plate.ink);
  const colors = new Float32Array(vertexCount * 3);
  for (let vertex = 0; vertex < vertexCount; vertex++) colors.set([r, g, b], vertex * 3);
  const quadCount = vertexCount / 4;
  const indices =
    vertexCount > 0xffff ? new Uint32Array(quadCount * 6) : new Uint16Array(quadCount * 6);
  for (let quad = 0; quad < quadCount; quad++) {
    const first = quad * 4;
    indices.set([first, first + 1, first + 2, first, first + 2, first + 3], quad * 6);
  }
  return {
    positions: new Float32Array(quads.positions),
    normals: new Float32Array(quads.normals),
    colors,
    indices,
    triangleCount: quadCount * 2,
    panes: null,
  };
}
