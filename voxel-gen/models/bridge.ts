// Stands BRIDGE_VOXELS high, not PAVING_VOXELS: inland water is flush with the
// banks, so a deck at path height would read as blue paving rather than a bridge.
import { PILE_ROWS, spanDeck, spanPiles } from '../parts/span.ts';
import { BRIDGE_VOXELS, defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'bridge',
  label: 'Bridge',
  category: 'grounds',
  // Never picked: a path drawn over inland water is laid as this.
  groundDecides: true,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const planks = BRIDGE_VOXELS - 1;
    spanDeck(b, { y: planks, z0: 0, z1: TILE_VOXELS - 1 });
    spanPiles(b, { beam: planks - 1, rows: PILE_ROWS });
  },
});
