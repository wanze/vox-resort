import { TILE_VOXELS, type ModelSeat, type SeatPose } from '../../../../voxel-gen/voxelgen.ts';
import { rotateSeats, rotationRadians, type Rotation } from '../../layout/domain/rotation';

export interface SeatSite {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rotation: Rotation;
  // The model's own size before the turn: seats are measured against the unturned model.
  readonly width: number;
  readonly depth: number;
  readonly seats: readonly ModelSeat[];
}

export interface SeatSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly heading: number;
  readonly pose: SeatPose;
  readonly tileX: number;
  readonly tileZ: number;
}

export function seatSpotsFor(sites: readonly SeatSite[]): SeatSpot[] {
  const spots: SeatSpot[] = [];
  for (const site of sites) {
    if (site.seats.length === 0) continue;
    for (const seat of rotateSeats(site.seats, site.width, site.depth, site.rotation)) {
      // Half a voxel on, because a person stands in the middle of a voxel column.
      const x = site.x + seat.x + 0.5;
      const z = site.z + seat.z + 0.5;
      spots.push({
        x,
        z,
        y: site.y + seat.y,
        heading: rotationRadians(seat.facing),
        pose: seat.pose ?? 'sit',
        tileX: Math.floor(x / TILE_VOXELS),
        tileZ: Math.floor(z / TILE_VOXELS),
      });
    }
  }
  return spots;
}
