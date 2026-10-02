import { PALETTE } from '../palette.ts';
import { balustrade, rampTreadAt } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ramp-foot-railing',
  label: 'Ramp Balustrade (Foot)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) =>
    balustrade(b, (z) => rampTreadAt('foot', z), {
      wall: PALETTE.sand.base,
      cap: PALETTE.stucco.base,
    }),
});
