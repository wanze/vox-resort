import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { OBJECT_TYPES, objectTypeById } from '../../catalog/domain/objectTypes';
import { seatSiteOf } from '../../catalog/domain/placementFacts';
import { RESTING } from '../../crowd/domain/crowd';
import { seatSpotsFor } from '../../crowd/domain/seating';
import type { WalkSeat } from '../../crowd/domain/walkNetwork';
import type { Placement } from '../../layout/domain/resortLayout';
import {
  normalizeRotation,
  rotateExtent,
  rotatePoint,
  rotationRadians,
  type Rotation,
} from '../../layout/domain/rotation';
import { venuesOn } from '../../sim/domain/venues';
import { placesFor } from './places';

const placed = (id: string, rotation: Rotation = 0, tileX = 2, tileZ = 3): Placement => {
  const { model } = objectTypeById(id);
  const tiles = rotateExtent(model.tiles.x, model.tiles.z, rotation);
  return {
    key: `${id}#0`,
    id,
    tileX,
    tileZ,
    tilesX: tiles.x,
    tilesZ: tiles.z,
    rotation,
    x: tileX * TILE_VOXELS,
    z: tileZ * TILE_VOXELS,
    y: 0,
    width: tiles.x * TILE_VOXELS,
    depth: tiles.z * TILE_VOXELS,
  };
};

const seatAt = (x: number, y: number, z: number): WalkSeat => ({
  x,
  y,
  z,
  heading: 0,
  pose: 'sit',
  node: 0,
});

const placesOf = (placement: Placement, seats: readonly WalkSeat[] = []) =>
  placesFor(venuesOn([placement]), new Map([[placement.key, placement]]), { seats })[0]!;

describe('placesFor', () => {
  it('turns a venue’s places with it, seats and spots alike', () => {
    const placement = placed('tennis-court', 1);
    const { model } = objectTypeById('tennis-court');
    const places = placesOf(placement);

    const seats = seatSpotsFor([seatSiteOf(placement)]);
    expect(places.watchers.map(({ x, z, heading }) => ({ x, z, heading }))).toEqual(
      seats.map(({ x, z, heading }) => ({ x, z, heading })),
    );
    const spots = model.venue!.spots!;
    expect(places.visitors).toHaveLength(spots.length);
    for (const [index, spot] of spots.entries()) {
      const turned = rotatePoint(spot, model.width, model.depth, 1);
      expect(places.visitors[index]).toMatchObject({
        x: placement.x + turned.x + 0.5,
        z: placement.z + turned.z + 0.5,
        y: spot.y,
        heading: rotationRadians(normalizeRotation(spot.facing + 1)),
        pose: RESTING.standing,
      });
    }
  });

  it('fills the spots the venue is for before its benches', () => {
    const both = OBJECT_TYPES.find(
      (type) =>
        (type.model.venue?.spots ?? []).some((spot) => (spot.for ?? 'visitor') === 'visitor') &&
        type.model.seats.some((seat) => !seat.watches && !seat.post),
    )!;
    const placement = placed(both.id);
    const spots = both.model.venue!.spots!.filter((spot) => (spot.for ?? 'visitor') === 'visitor');
    const seats = seatSpotsFor([seatSiteOf(placement)]).filter(
      (_, index) => !both.model.seats[index]!.watches && !both.model.seats[index]!.post,
    );
    const { visitors } = placesOf(placement);

    expect(visitors).toHaveLength(spots.length + seats.length);
    expect(visitors.slice(0, spots.length).map(({ x, z }) => ({ x, z }))).toEqual(
      spots.map((spot) => ({ x: placement.x + spot.x + 0.5, z: placement.z + spot.z + 0.5 })),
    );
    expect(visitors.slice(spots.length).map(({ x, z }) => ({ x, z }))).toEqual(
      seats.map(({ x, z }) => ({ x, z })),
    );
  });

  it('keeps a spectator’s seat for the line, never for a visitor', () => {
    const { watchers, visitors } = placesOf(placed('tennis-court'));
    expect(watchers.length).toBeGreaterThan(0);
    for (const place of watchers) {
      expect(place.kind).toBe('watcher');
      expect(place.pose).toBe(RESTING.sitting);
    }
    for (const place of visitors) expect(place.kind).toBe('visitor');
  });

  it('finds a seat on the network by where it is, and keeps a dropped one as a place', () => {
    const placement = placed('tennis-court');
    const [first, second] = seatSpotsFor([seatSiteOf(placement)]);
    const network = [seatAt(0, 0, 0), seatAt(second!.x, second!.y, second!.z)];
    const { watchers } = placesOf(placement, network);
    expect(watchers[0]!.x).toBe(first!.x);
    expect(watchers[0]!.seat).toBe(-1);
    expect(watchers[1]!.seat).toBe(1);
  });

  it('has four empty lists for a venue that declares nothing', () => {
    expect(placesOf(placed('restrooms'))).toEqual({
      visitors: [],
      watchers: [],
      animators: [],
      lifeguards: [],
    });
  });
});
