import { describe, expect, it } from 'vitest';
import { MODEL_SOURCES } from './models/index.ts';
import { VARIANT_SOURCES } from './variants/index.ts';
import { buildModel, type VoxelModel } from './voxelgen.ts';

const ENTRANCES: readonly VoxelModel[] = [...MODEL_SOURCES, ...VARIANT_SOURCES]
  .map(buildModel)
  .filter((model) => model.id === 'entrance' || model.id === 'entrance-b');

describe('the nameplates the entrances declare', () => {
  it('lies on a painted board with room in front of it for the letters', () => {
    expect(ENTRANCES).toHaveLength(2);
    for (const { id, nameplate, voxels, width, height, depth } of ENTRANCES) {
      expect(nameplate, `${id} declares no nameplate`).not.toBeNull();
      const plate = nameplate!;
      expect(plate.x0).toBeGreaterThanOrEqual(0);
      expect(plate.x1).toBeLessThan(width);
      expect(plate.y0).toBeGreaterThanOrEqual(0);
      expect(plate.y1).toBeLessThan(height);
      const painted = new Set(voxels.map((voxel) => `${voxel.x},${voxel.y},${voxel.z}`));
      for (const { surface, outward } of plate.faces) {
        expect(surface + outward).toBeGreaterThanOrEqual(0);
        expect(surface + outward).toBeLessThan(depth);
        for (let x = plate.x0; x <= plate.x1; x++) {
          for (let y = plate.y0; y <= plate.y1; y++) {
            expect(painted.has(`${x},${y},${surface}`), `${id} board at ${x},${y}`).toBe(true);
            expect(painted.has(`${x},${y},${surface + outward}`), `${id} in front`).toBe(false);
          }
        }
      }
    }
  });
});
