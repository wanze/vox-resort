import { balustrade, flightTreadAt } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'stair-railing-right',
  label: 'Stair Balustrade (Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) =>
    balustrade(b, flightTreadAt, { wall: 0xbfae87, cap: 0xe4d9c4 }, 'right'),
});
