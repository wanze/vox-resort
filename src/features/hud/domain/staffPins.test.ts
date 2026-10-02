import { describe, expect, it } from 'vitest';
import { ADULT_VOXELS } from '../../../../voxel-gen/people/figure.ts';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import type { StaffRole } from '../../sim/domain/staff';
import { createStaffTask, type StaffTask } from '../../sim/domain/staffRouter';
import { createPinSpot, isPinned, roofOver, staffPinOf, tallyStaff, type Roofs } from './staffPins';

const ROOFS: Roofs = {
  venues: [roofOver({ tileX: 2, tileZ: 3, tilesX: 2, tilesZ: 1 }, 4, 10), null],
  lodgings: [roofOver({ tileX: 6, tileZ: 0, tilesX: 1, tilesZ: 1 }, 0, 12)],
  depots: [roofOver({ tileX: 9, tileZ: 9, tilesX: 1, tilesZ: 1 }, 0, 8)],
};

const task = (parts: Partial<StaffTask>): StaffTask => ({ ...createStaffTask(), ...parts });

const FEET = { x: 5, y: 1, z: 7 };

describe('roofOver', () => {
  it('stands over the middle of the footprint, a little above the model', () => {
    expect(roofOver({ tileX: 2, tileZ: 3, tilesX: 2, tilesZ: 1 }, 4, 10)).toEqual({
      x: 3 * TILE_VOXELS,
      y: 16,
      z: 3.5 * TILE_VOXELS,
    });
  });
});

describe('staffPinOf', () => {
  it('pins a worker in sight over their head', () => {
    const spot = createPinSpot();
    expect(staffPinOf(task({ kind: 'idle', load: 4 }), FEET, ROOFS, spot)).toBe(true);
    expect(spot.inside).toBe(false);
    expect([spot.x, spot.z]).toEqual([FEET.x, FEET.z]);
    expect(spot.y).toBeGreaterThan(FEET.y + ADULT_VOXELS);
  });

  it('pins a worker at a covered venue over its roof, and one at an open venue at their head', () => {
    const spot = createPinSpot();
    expect(staffPinOf(task({ kind: 'venue', venue: 0, working: true }), FEET, ROOFS, spot)).toBe(
      true,
    );
    expect(spot).toEqual({ ...ROOFS.venues[0], inside: true });
    staffPinOf(task({ kind: 'venue', venue: 1, working: true }), FEET, ROOFS, spot);
    expect(spot.inside).toBe(false);
    staffPinOf(task({ kind: 'venue', venue: 0, working: false }), FEET, ROOFS, spot);
    expect(spot.inside, 'still on the way there').toBe(false);
  });

  it('pins a worker making up a room over the lodging, and one restocking over the depot', () => {
    const spot = createPinSpot();
    staffPinOf(task({ kind: 'room', lodging: 0, working: true }), FEET, ROOFS, spot);
    expect(spot).toEqual({ ...ROOFS.lodgings[0], inside: true });
    staffPinOf(task({ kind: 'restock', depot: 0, working: true }), FEET, ROOFS, spot);
    expect(spot).toEqual({ ...ROOFS.depots[0], inside: true });
  });

  it('pins nobody off duty or off the plot', () => {
    const spot = createPinSpot();
    expect(staffPinOf(task({ kind: 'off' }), FEET, ROOFS, spot)).toBe(false);
    const nowhere = { x: Number.NaN, y: Number.NaN, z: Number.NaN };
    expect(staffPinOf(task({ kind: 'idle' }), nowhere, ROOFS, spot)).toBe(false);
  });
});

describe('isPinned', () => {
  it('keeps the selected worker pinned with the pins put away', () => {
    expect(isPinned(3, false, 3)).toBe(true);
    expect(isPinned(2, false, 3)).toBe(false);
    expect(isPinned(2, true, null)).toBe(true);
    expect(isPinned(2, false, null)).toBe(false);
  });
});

describe('tallyStaff', () => {
  it('counts each role working, walking and idle, and leaves out whoever is off', () => {
    const roles: StaffRole[] = ['cleaner', 'cleaner', 'cleaner', 'cleaner', 'mechanic'];
    const tasks = [
      task({ kind: 'venue', working: true }),
      task({ kind: 'sweep' }),
      task({ kind: 'idle' }),
      task({ kind: 'off' }),
      task({ kind: 'idle' }),
    ];
    const tally = tallyStaff(roles, (worker, into) => Object.assign(into, tasks[worker]));
    expect(tally.cleaner).toEqual({ working: 1, walking: 1, idle: 1 });
    expect(tally.mechanic).toEqual({ working: 0, walking: 0, idle: 1 });
    expect(tally.lifeguard).toEqual({ working: 0, walking: 0, idle: 0 });
  });
});
