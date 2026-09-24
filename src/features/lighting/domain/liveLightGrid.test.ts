import { describe, expect, it } from 'vitest';
import type { LightAnchor } from './lightAnchors';
import type { CellRange, LightGridSpec } from './lightGrid';
import { bakeLightGrid, cellCount, gridSpecAt, rangeCells, rangeDims } from './lightGrid';
import { createLiveLightGrid } from './liveLightGrid';

const anchor = (overrides: Partial<LightAnchor> = {}): LightAnchor => ({
  key: 'lamp',
  x: 0,
  y: 18,
  z: 0,
  color: 0xffffff,
  intensity: 100,
  distance: 40,
  ...overrides,
});

const west = anchor({ key: 'west', x: -120, z: 0 });
const east = anchor({ key: 'east', x: 120, z: 0 });
const standing = [west, east];
const spec = gridSpecAt(standing, 4)!;

const liveGrid = (anchors: readonly LightAnchor[] = standing, at: LightGridSpec = spec) =>
  createLiveLightGrid(bakeLightGrid(anchors, at), anchors);

function cellFor(at: LightGridSpec, x: number, y: number, z: number): [number, number, number] {
  return [
    Math.floor((x - at.origin.x) / at.cellSize),
    Math.floor((y - at.origin.y) / at.cellSize),
    Math.floor((z - at.origin.z) / at.cellSize),
  ];
}

function bytesAt(
  irradiance: Uint8Array,
  at: LightGridSpec,
  [ix, iy, iz]: readonly [number, number, number],
): Uint8Array {
  const cell = (ix + at.dims.x * (iy + at.dims.y * iz)) * 4;
  return irradiance.slice(cell, cell + 4);
}

function inRange(range: CellRange, ix: number, iy: number, iz: number): boolean {
  return (
    ix >= range.lowX &&
    ix <= range.highX &&
    iy >= range.lowY &&
    iy <= range.highY &&
    iz >= range.lowZ &&
    iz <= range.highZ
  );
}

describe('createLiveLightGrid', () => {
  it('starts with the lamps the bake was given', () => {
    expect(liveGrid().lampCount).toBe(2);
  });

  it('does not count a light that puts out nothing', () => {
    const dark = anchor({ key: 'dark', intensity: 0 });
    expect(liveGrid([west, dark]).lampCount).toBe(1);
  });

  describe('adding a lamp', () => {
    it('lights cells that were dark', () => {
      const grid = liveGrid();
      const middle = cellFor(spec, 0, 18, 0);
      expect([...bytesAt(grid.irradiance, spec, middle)].slice(0, 3)).toEqual([0, 0, 0]);

      grid.add(anchor({ key: 'middle', x: 0, z: 0 }));
      expect(bytesAt(grid.irradiance, spec, middle)[0]).toBeGreaterThan(0);
      expect(grid.lampCount).toBe(3);
      expect(grid.litCells).toBeGreaterThan(0);
    });

    it('writes exactly what a full re-bake at the same scale would have written', () => {
      const extra = anchor({ key: 'middle', x: 0, z: 0 });
      const grid = liveGrid();
      grid.add(extra);

      const whole = bakeLightGrid([...standing, extra], spec, { scale: grid.scale });
      expect(grid.irradiance).toEqual(whole.irradiance);
      expect(grid.direction).toEqual(whole.direction);
      expect(grid.litCells).toBe(whole.litCells);
    });

    it('changes no byte outside the region it reports', () => {
      const grid = liveGrid();
      const before = grid.irradiance.slice();
      const { region } = grid.add(anchor({ key: 'middle', x: 0, z: 0 }));
      expect(region).not.toBeNull();

      let changedOutside = 0;
      for (let iz = 0; iz < spec.dims.z; iz++) {
        for (let iy = 0; iy < spec.dims.y; iy++) {
          for (let ix = 0; ix < spec.dims.x; ix++) {
            if (inRange(region!, ix, iy, iz)) continue;
            const at = (ix + spec.dims.x * (iy + spec.dims.y * iz)) * 4;
            for (let byte = 0; byte < 4; byte++) {
              if (before[at + byte] !== grid.irradiance[at + byte]) changedOutside++;
            }
          }
        }
      }
      expect(changedOutside).toBe(0);
    });

    it('reports the block the lamp reaches, not the grid', () => {
      const grid = liveGrid();
      const { region } = grid.add(anchor({ key: 'middle', x: 0, z: 0, distance: 40 }));
      const dims = rangeDims(region!);
      expect(dims.x).toBeLessThanOrEqual(2 * (40 / 4) + 2);
      expect(dims.z).toBeLessThanOrEqual(2 * (40 / 4) + 2);
      expect(rangeCells(region!)).toBeLessThan(cellCount(spec) / 3);
    });

    it('refuses a key that is already burning', () => {
      const grid = liveGrid();
      expect(() => grid.add(anchor({ key: 'west', x: 0 }))).toThrow(/already burning/);
    });

    it('brightens a cell two lamps both reach', () => {
      const grid = liveGrid();
      const beside = cellFor(spec, -100, 18, 0);
      const before = bytesAt(grid.irradiance, spec, beside)[0]!;
      grid.add(anchor({ key: 'neighbour', x: -80, z: 0 }));
      expect(bytesAt(grid.irradiance, spec, beside)[0]!).toBeGreaterThan(before);
    });
  });

  describe('a lamp the grid cannot hold', () => {
    it('lights nothing and is not counted when it lands well outside', () => {
      const grid = liveGrid();
      const before = grid.irradiance.slice();
      const edit = grid.add(anchor({ key: 'far', x: 10_000, z: 10_000 }));
      expect(edit.region).toBeNull();
      expect(grid.lampCount).toBe(2);
      expect(grid.irradiance).toEqual(before);
    });

    it('keeps the outermost shell dark when it spills in from the edge', () => {
      // The sampler clamps against the shell: a lit edge cell would smear light beyond the grid.
      const grid = liveGrid();
      const edge = spec.origin.x + 2 * spec.cellSize;
      grid.add(anchor({ key: 'edge', x: edge, z: 0, distance: 70 }));

      for (let iz = 0; iz < spec.dims.z; iz++) {
        for (let iy = 0; iy < spec.dims.y; iy++) {
          expect([...bytesAt(grid.irradiance, spec, [0, iy, iz])].slice(0, 3)).toEqual([0, 0, 0]);
        }
      }
    });
  });

  describe('removing a lamp', () => {
    it('puts the grid back exactly as it was', () => {
      const grid = liveGrid();
      const before = grid.irradiance.slice();
      const beforeDirection = grid.direction.slice();
      const beforeLit = grid.litCells;

      grid.add(anchor({ key: 'middle', x: 0, z: 0 }));
      grid.remove('middle');

      expect(grid.irradiance).toEqual(before);
      expect(grid.direction).toEqual(beforeDirection);
      expect(grid.litCells).toBe(beforeLit);
      expect(grid.lampCount).toBe(2);
    });

    it('leaves the lamps it overlapped burning', () => {
      const grid = liveGrid();
      const beside = cellFor(spec, -100, 18, 0);
      const before = bytesAt(grid.irradiance, spec, beside);

      grid.add(anchor({ key: 'neighbour', x: -80, z: 0 }));
      grid.remove('neighbour');
      expect(bytesAt(grid.irradiance, spec, beside)).toEqual(before);
    });

    it('takes a lamp that was there from the start away', () => {
      const grid = liveGrid();
      const under = cellFor(spec, -120, 18, 0);
      expect(bytesAt(grid.irradiance, spec, under)[0]).toBeGreaterThan(0);

      const { region } = grid.remove('west');
      expect(region).not.toBeNull();
      expect(bytesAt(grid.irradiance, spec, under)[0]).toBe(0);
      expect(grid.lampCount).toBe(1);
    });

    it('does nothing for a key that never burned', () => {
      const grid = liveGrid();
      const before = grid.irradiance.slice();
      expect(grid.remove('nobody').region).toBeNull();
      expect(grid.irradiance).toEqual(before);
    });
  });

  describe('the encoding scale', () => {
    it('holds still as lamps come and go', () => {
      const grid = liveGrid();
      const scale = grid.scale;
      grid.add(anchor({ key: 'middle', x: 0, z: 0 }));
      expect(grid.scale).toBe(scale);
      grid.remove('west');
      expect(grid.scale).toBe(scale);
    });

    it('is set by the first lamp on a grid that had none', () => {
      // Any scale is safe for the first lamp: every cell it does not re-encode is zero.
      const dark = [anchor({ key: 'placeholder', intensity: 0 })];
      const grid = liveGrid(dark, gridSpecAt(dark, 4)!);
      expect(grid.scale).toBe(0);

      const edit = grid.add(anchor({ key: 'first', x: 0, z: 0, distance: 30 }));
      expect(edit.scale).toBeGreaterThan(0);
      expect(grid.scale).toBe(edit.scale);
      expect(grid.litCells).toBeGreaterThan(0);
    });

    it('reports the cells a lamp too bright for it clamped', () => {
      const dim = [anchor({ key: 'dim', x: -120, z: 0, intensity: 20 })];
      const grid = liveGrid(dim, spec);
      expect(grid.clampedCells).toBe(0);

      grid.add(anchor({ key: 'blinding', x: 0, z: 0, intensity: 4000 }));
      expect(grid.clampedCells).toBeGreaterThan(0);

      grid.remove('blinding');
      expect(grid.clampedCells).toBe(0);
    });
  });
});
