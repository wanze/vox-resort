// The flight a boardwalk lays where it climbs the dunes: stone between two runs of decking read
// as a patch.
import { DECK_FLANK, DECKING } from '../parts/decking.ts';
import { flight } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-stairs',
  label: 'Boardwalk Stairs',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) =>
    flight(b, { body: DECKING.joist, flank: DECK_FLANK, treads: DECKING.boards }),
});
