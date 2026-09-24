import type { ModelDoor, ModelLight, ModelSeat } from '../../../../voxel-gen/voxelgen.ts';

// Quarter turns only: anything finer breaks tile footprints and grid alignment.
// A turn n is n * 90 degrees in makeRotationY's sense, swinging north to face west.
export type Rotation = 0 | 1 | 2 | 3;

export const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];

export interface Extent {
  readonly x: number;
  readonly z: number;
}

export function normalizeRotation(turns: number): Rotation {
  return (((Math.trunc(turns) % 4) + 4) % 4) as Rotation;
}

export function rotationRadians(rotation: Rotation): number {
  return (rotation * Math.PI) / 2;
}

export function swapsAxes(rotation: Rotation): boolean {
  return rotation % 2 === 1;
}

export function rotateExtent(x: number, z: number, rotation: Rotation): Extent {
  return swapsAxes(rotation) ? { x: z, z: x } : { x, z };
}

// A rotation turns about the origin, pushing the box partly negative; this is the
// translation that brings it back into its own footprint.
export function turnedOrigin(width: number, depth: number, rotation: Rotation): Extent {
  switch (rotation) {
    case 1:
      return { x: 0, z: depth };
    case 2:
      return { x: width, z: depth };
    case 3:
      return { x: width, z: 0 };
    default:
      return { x: 0, z: 0 };
  }
}

// width and depth are the size before the turn. Must match the instance matrix, or
// lamps and seats drift off the parts they were declared on.
export function rotatePoint(
  point: Extent,
  width: number,
  depth: number,
  rotation: Rotation,
): Extent {
  switch (rotation) {
    case 1:
      return { x: point.z, z: width - point.x };
    case 2:
      return { x: width - point.x, z: depth - point.z };
    case 3:
      return { x: depth - point.z, z: point.x };
    default:
      return { x: point.x, z: point.z };
  }
}

export function rotateLights(
  lights: readonly ModelLight[],
  width: number,
  depth: number,
  rotation: Rotation,
): readonly ModelLight[] {
  if (rotation === 0 || lights.length === 0) return lights;
  return lights.map((light) => ({
    ...light,
    ...rotatePoint(light, width, depth, rotation),
  }));
}

export function rotateSeats(
  seats: readonly ModelSeat[],
  width: number,
  depth: number,
  rotation: Rotation,
): readonly ModelSeat[] {
  if (rotation === 0 || seats.length === 0) return seats;
  return seats.map((seat) => ({
    ...seat,
    ...rotatePoint(seat, width, depth, rotation),
    facing: normalizeRotation(seat.facing + rotation),
  }));
}

export function rotateDoors(
  doors: readonly ModelDoor[],
  width: number,
  depth: number,
  rotation: Rotation,
): readonly ModelDoor[] {
  if (rotation === 0 || doors.length === 0) return doors;
  return doors.map((door) => ({
    ...rotatePoint(door, width, depth, rotation),
    facing: normalizeRotation(door.facing + rotation),
  }));
}
