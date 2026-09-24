// A model of its own rather than part of the deck, so a junction of two crossings gets no rail
// across it. Stands at the water's height like every rail on its tile; the trestle carries it up to
// the deck.
import {
  LANTERN,
  lanternLight,
  PARAPET_RAIL,
  spanLantern,
  spanParapet,
  type LanternSpot,
} from '../parts/span.ts';
import { BRIDGE_VOXELS, defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

const PLANKS = BRIDGE_VOXELS - 1;

// Centred, so it stays put however the rail is turned.
const LAMP: LanternSpot = { x: TILE_VOXELS / 2 - 1, rail: PLANKS + PARAPET_RAIL };

export default defineModel({
  id: 'bridge-railing',
  label: 'Bridge Railing',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  emissive: [LANTERN],
  lights: [lanternLight(LAMP)],
  build: (b: VoxelBuilder) => {
    spanParapet(b, { planksAt: () => PLANKS });
    spanLantern(b, LAMP);
  },
});
