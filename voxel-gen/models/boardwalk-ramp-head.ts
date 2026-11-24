// A ramp up the dunes in the boardwalk's planks: stone between two runs of decking read as a patch.
import { DECK_RAMP } from '../parts/decking.ts';
import { ramp } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-ramp-head',
  label: 'Boardwalk Ramp (Head)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  cost: 30,
  build: (b: VoxelBuilder) => ramp(b, 'head', DECK_RAMP),
});
