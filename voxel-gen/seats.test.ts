import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from './models/index.ts';
import { SEA_SOURCES } from './sea/index.ts';
import { buildModel, TILE_VOXELS, type ModelSeat, type VoxelModel } from './voxelgen.ts';

/**
 * The seats every model declares, checked against the model's own voxels.
 *
 * These are art tests rather than logic tests, and they exist because a seat is
 * two numbers written in one place about voxels painted in another. A cushion
 * moved up a course leaves the sitter hovering, and nothing else in the suite
 * would notice: `crowd.ts` will happily seat somebody in mid-air, and the
 * preview renders furniture without anybody on it.
 *
 * What is checked is the least that has to be true of a seat: there is
 * something under it, there is room above it, and it is on the object. What is
 * deliberately *not* checked is the space the body sweeps out — a head on a
 * bolster and feet over the end of a lounger are both wanted, and both overlap
 * the model.
 *
 * The bay's craft are in here alongside the catalogue, and they are the reason
 * the checks earn their keep twice over. A thwart is declared against
 * `HULL_RIM` in a second file, and a boat's own seat is the one thing on it
 * that nothing on the plot can be measured against: a bench that seats somebody
 * a course high is obvious beside its paving, where a rower a course high is
 * just a figure over open water. See `features/sea/domain/passengers.ts`.
 */
const MODELS: readonly VoxelModel[] = [...MODEL_SOURCES, ...SEA_SOURCES].map(buildModel);

const withSeats = MODELS.filter((model) => model.seats.length > 0);

/** The colour painted at a cell, or undefined where nothing is. */
const cells = (model: VoxelModel): ReadonlySet<string> =>
  new Set(model.voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));

const at = (seat: ModelSeat, dy: number): string => `${seat.x},${seat.y + dy},${seat.z}`;

describe('the seats the catalogue declares', () => {
  it('is declared by the models that draw furniture', () => {
    // A floor under this list rather than the list itself: a model that grows a
    // bench should not have to be added to a test to be allowed one.
    expect(withSeats.length).toBeGreaterThanOrEqual(10);
  });

  it('stands every seat on something solid', () => {
    for (const model of withSeats) {
      const painted = cells(model);
      for (const seat of model.seats) {
        // The layer below the hips is the cushion, the plank or the mattress.
        expect(painted.has(at(seat, -1)), `${model.id} seats nobody at ${at(seat, 0)}`).toBe(true);
      }
    }
  });

  it('leaves a sitter clear of the furniture they sit on', () => {
    // Four courses, which is what a seated figure is above its hips: a rail or
    // a backrest through any of them is a person wearing the furniture.
    //
    // Sitting only. A lying figure takes the two courses directly over the
    // mattress, which is exactly where a towel, a bolster and a cushion are
    // drawn — it lies *on* them, so an overlap there is the model working as
    // drawn. What still has to be true of a lounger is the course below, which
    // the test above checks.
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
    // A figure is three voxels across and two deep, so two seats on one plank
    // have to be at least three columns apart or the two of them are one
    // person and a half.
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
