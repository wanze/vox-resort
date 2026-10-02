// The same flight as stairs.ts under its own id: a path's fallback flight turns into a ramp once a
// foot is free, and a staircase the player chose must not.
import { flight } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'staircase',
  label: 'Stairs',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  cost: 70,
  build: (b: VoxelBuilder) => flight(b),
});
