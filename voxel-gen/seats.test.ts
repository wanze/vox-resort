import { describe, expect, it } from 'vitest';
import { DRAFT_SOURCES, MODEL_SOURCES } from './models/index.ts';
import { SEA_SOURCES } from './sea/index.ts';
import { buildModel, TILE_VOXELS, type ModelSeat, type VoxelModel } from './voxelgen.ts';

const MODELS: readonly VoxelModel[] = [...MODEL_SOURCES, ...DRAFT_SOURCES, ...SEA_SOURCES].map(
  buildModel,
);

const withSeats = MODELS.filter((model) => model.seats.length > 0);

const cells = (model: VoxelModel): ReadonlySet<string> =>
  new Set(model.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));

const at = (seat: ModelSeat, dy: number): string => `${seat.x},${seat.y + dy},${seat.z}`;

describe('the seats the catalogue declares', () => {
  it('is declared by the models that draw furniture', () => {
    expect(withSeats.length).toBeGreaterThanOrEqual(10);
  });

  it('stands every seat on something solid', () => {
    for (const model of withSeats) {
      const painted = cells(model);
      for (const seat of model.seats) {
        expect(painted.has(at(seat, -1)), `${model.id} seats nobody at ${at(seat, 0)}`).toBe(true);
      }
    }
  });

  it('leaves a sitter clear of the furniture they sit on', () => {
    // Sitting only: a lying figure rests on towels and bolsters, so overlap there is intended.
    for (const model of withSeats) {
      const painted = cells(model);
      for (const seat of model.seats) {
        if (seat.pose === 'lie') continue;
        for (let course = 0; course < 4; course++) {
          expect(painted.has(at(seat, course)), `${model.id} blocks ${at(seat, course)}`).toBe(
            false,
          );
        }
      }
    }
  });

  it('keeps every seat inside the footprint its model claims', () => {
    for (const model of withSeats) {
      for (const seat of model.seats) {
        expect(seat.x, `${model.id} seats somebody off its west edge`).toBeGreaterThanOrEqual(0);
        expect(seat.z, `${model.id} seats somebody off its north edge`).toBeGreaterThanOrEqual(0);
        expect(seat.x, `${model.id} seats somebody off its east edge`).toBeLessThan(
          model.tiles.x * TILE_VOXELS,
        );
        expect(seat.z, `${model.id} seats somebody off its south edge`).toBeLessThan(
          model.tiles.z * TILE_VOXELS,
        );
      }
    }
  });

  it('seats nobody twice in one place', () => {
    for (const model of MODELS) {
      const spots = model.seats.map((seat) => `${seat.x},${seat.y},${seat.z}`);
      expect(new Set(spots).size, `${model.id} declares two seats at one spot`).toBe(spots.length);
    }
  });

  it('lets nobody sit shoulder to shoulder, which is three voxels apart', () => {
    for (const model of MODELS) {
      for (const seat of model.seats) {
        for (const other of model.seats) {
          if (seat === other || seat.y !== other.y) continue;
          const apart = Math.max(Math.abs(seat.x - other.x), Math.abs(seat.z - other.z));
          expect(apart, `${model.id} crowds ${at(seat, 0)} and ${at(other, 0)}`).toBeGreaterThan(2);
        }
      }
    }
  });
});
