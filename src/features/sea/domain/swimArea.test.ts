import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { shoreFor, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { sailingGroundFor, swimAreaMoorings, type Rental } from './swimArea';

const shore = (wave = 0): Shore =>
  shoreFor({ tilesX: 48, tilesZ: 40, shore: { inset: 8, beach: 10, wave, seed: 5 } })!;

/** The tile a mooring is in, back out of the voxels it was placed at. */
const tileOf = (mooring: { x: number; z: number }) => ({
  x: Math.floor(mooring.x / TILE_VOXELS),
  z: Math.floor(mooring.z / TILE_VOXELS),
});

describe('swimAreaMoorings', () => {
  it('moors nothing on a plot with no sea', () => {
    expect(swimAreaMoorings({ shore: null })).toEqual([]);
  });

  it('strings a line of buoys across the bay, evenly spaced', () => {
    const moorings = swimAreaMoorings({ shore: shore() });
    expect(moorings.length).toBeGreaterThan(6);
    const columns = moorings.map((mooring) => tileOf(mooring).x);
    const steps = new Set(columns.slice(1).map((column, index) => column - columns[index]!));
    expect([...steps]).toEqual([4]);
  });

  it('moors every buoy in the water, at one depth out from its own tideline', () => {
    const bay = shore();
    for (const mooring of swimAreaMoorings({ shore: bay })) {
      const tile = tileOf(mooring);
      expect(tile.z - waterStartZ(bay, tile.x)).toBe(3);
    }
  });

  it('follows a coast that wanders, rather than running straight', () => {
    // The whole reason the line is described as a depth: a fixed distance out
    // from a bay that curves curves with it.
    const rows = new Set(swimAreaMoorings({ shore: shore(3) }).map((m) => tileOf(m).z));
    expect(rows.size).toBeGreaterThan(1);
  });

  it('stops for a tile something already stands on, and carries on', () => {
    const bay = shore();
    const all = swimAreaMoorings({ shore: bay });
    const taken = tileOf(all[2]!);
    const cut = swimAreaMoorings({
      shore: bay,
      claimed: (tileX, tileZ) => tileX === taken.x && tileZ === taken.z,
    });
    expect(cut).toHaveLength(all.length - 1);
    expect(cut.map(tileOf)).not.toContainEqual(taken);
  });

  it('moors nothing past the southern edge of the plot', () => {
    // A bay deeper than the plot has water the renderer draws and the camera is
    // never framed on; a buoy out there is one nobody sees.
    const deep = shoreFor({
      tilesX: 20,
      tilesZ: 20,
      shore: { inset: 2, beach: 4, wave: 0, seed: 1 },
    })!;
    for (const mooring of swimAreaMoorings({ shore: deep })) {
      expect(tileOf(mooring).z).toBeLessThan(20);
    }
  });
});

describe('sailingGroundFor', () => {
  it('keeps the craft outside the buoys, all the way along a wandering coast', () => {
    const bay = shore(3);
    const ground = sailingGroundFor(bay);
    for (const mooring of swimAreaMoorings({ shore: bay })) {
      expect(ground.landwardZ(mooring.x)).toBeGreaterThan(mooring.z);
    }
  });

  it('runs the full width of the plot and out past its southern edge', () => {
    const ground = sailingGroundFor(shore());
    expect(ground.westX).toBe(0);
    expect(ground.eastX).toBe(48 * TILE_VOXELS);
    expect(ground.seawardZ).toBeGreaterThan(40 * TILE_VOXELS);
  });

  it('curves with the coast rather than lying across it', () => {
    const ground = sailingGroundFor(shore(3));
    const limits = new Set(
      Array.from({ length: 12 }, (_, tile) => ground.landwardZ(tile * 4 * TILE_VOXELS)),
    );
    expect(limits.size).toBeGreaterThan(1);
  });
});

describe('the corridor in front of the hire hut', () => {
  const bay = shore();
  /** A hut standing behind the middle of the bay. */
  const RENTAL: Rental = { x: 24 * TILE_VOXELS, z: 20 * TILE_VOXELS };

  it('leaves a gap in the line of buoys, and only there', () => {
    const open = swimAreaMoorings({ shore: bay });
    const cut = swimAreaMoorings({ shore: bay, rental: RENTAL });
    expect(cut.length).toBeLessThan(open.length);
    const gone = open.filter((mooring) => !cut.some((kept) => kept.x === mooring.x));
    expect(gone.length).toBeGreaterThan(0);
    for (const mooring of gone) {
      expect(Math.abs(mooring.x - RENTAL.x)).toBeLessThanOrEqual(2 * TILE_VOXELS);
    }
  });

  it('lets the craft in to the shallows in front of the hut, and nowhere else', () => {
    const open = sailingGroundFor(bay);
    const corridor = sailingGroundFor(bay, RENTAL);
    // In the corridor: a tile off the tideline rather than five.
    expect(corridor.landwardZ(RENTAL.x)).toBeLessThan(open.landwardZ(RENTAL.x) - 3 * TILE_VOXELS);
    // Well away from it: exactly the bathing area everywhere else has.
    const far = RENTAL.x + 20 * TILE_VOXELS;
    expect(corridor.landwardZ(far)).toBe(open.landwardZ(far));
  });

  it('ramps the limit out rather than stepping it', () => {
    // A step would turn a craft that drifted a voxel sideways hard about; the
    // flare walks it back out to the line instead.
    const corridor = sailingGroundFor(bay, RENTAL);
    const across = Array.from({ length: 9 }, (_, step) =>
      corridor.landwardZ(RENTAL.x + (2 + step * 0.25) * TILE_VOXELS),
    );
    for (let step = 1; step < across.length; step++) {
      expect(across[step]!).toBeGreaterThanOrEqual(across[step - 1]!);
      expect(across[step]! - across[step - 1]!).toBeLessThan(TILE_VOXELS);
    }
  });
});
