import type { ShoreSpec } from './shoreline';
import type { ElevationSpec } from './elevation';
import type { Rotation } from './rotation';
import type { TerrainEdit } from './terrain';

export interface ResortPlot {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
  // An odd turn swaps the footprint; the anchor stays the north-west tile.
  readonly rotation?: Rotation;
}

export interface PathNode {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

export type Bend = 'x-first' | 'z-first';

export interface PathEdge {
  readonly from: string;
  readonly to: string;
  readonly width?: number;
  readonly bend?: Bend;
  // Off by default: a street strung over a plot with a bay should stop at the sand, not pave
  // a causeway. A run that sets it is a pier.
  readonly overWater?: boolean;
}

export interface Plaza {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface ResortPlan {
  readonly tilesX: number;
  readonly tilesZ: number;
  readonly plots: readonly ResortPlot[];
  readonly nodes: readonly PathNode[];
  readonly edges: readonly PathEdge[];
  // A tile an object stands on is never paved, so the fountain does not sever its plaza.
  readonly plazas: readonly Plaza[];
  readonly shore?: ShoreSpec;
  readonly elevation?: ElevationSpec;
  // A list of tiles rather than a spec: no line strung across the plot can say one tile is a lake.
  readonly terrain?: readonly TerrainEdit[];
  readonly parks?: readonly Plaza[];
  readonly avenues?: { readonly tree: string; readonly streets: readonly Plaza[] };
  // A catalogue type the authored plan forgot is a mistake, so layoutResort reports it.
  readonly standsWholeCatalogue?: boolean;
}

export const PATH_ID = 'path';

export const BOARDWALK_ID = 'boardwalk';

export const STAIRS_ID = 'stairs';

export const JETTY_ID = 'jetty';

export const BRIDGE_ID = 'bridge';

export const BRIDGE_RAMP_ID = 'bridge-ramp';

export const PAVING_IDS: ReadonlySet<string> = new Set([
  PATH_ID,
  BOARDWALK_ID,
  STAIRS_ID,
  JETTY_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
]);

export const LAMP_ID = 'street-lamp';
export const HEDGE_ID = 'hedge';

export const BENCH_ID = 'bench';

// Named here because the bay steers its hire craft home to wherever it stands.
export const PEDALO_RENTAL_ID = 'pedalo-rental';

export const RAILING_ID = 'railing';

export const PIER_RAILING_ID = 'pier-railing';

export const STAIR_RAILING_ID = 'stair-railing';

export const BRIDGE_RAILING_ID = 'bridge-railing';

export const BRIDGE_RAMP_RAILING_LEFT_ID = 'bridge-ramp-railing-left';
export const BRIDGE_RAMP_RAILING_RIGHT_ID = 'bridge-ramp-railing-right';

export const DERIVED_IDS: ReadonlySet<string> = new Set([
  PATH_ID,
  BOARDWALK_ID,
  STAIRS_ID,
  JETTY_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
  LAMP_ID,
  HEDGE_ID,
  BENCH_ID,
  RAILING_ID,
  PIER_RAILING_ID,
  STAIR_RAILING_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
]);

const at = (id: string, tileX: number, tileZ: number): ResortPlot => ({ id, tileX, tileZ });

const row = (id: string, tileX: number, tileZ: number, count: number, step: number): ResortPlot[] =>
  Array.from({ length: count }, (_, i) => at(id, tileX + i * step, tileZ));

function block(
  id: string,
  tileX: number,
  tileZ: number,
  cols: number,
  rows: number,
  stepX: number,
  stepZ: number,
): ResortPlot[] {
  const plots: ResortPlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) plots.push(at(id, tileX + c * stepX, tileZ + r * stepZ));
  }
  return plots;
}

// Unturned, flat and without a shore on purpose: this is the plot a ?bench=1 run measures,
// and runs are only comparable if the scene has not moved.
export const RESORT_PLAN: ResortPlan = {
  tilesX: 112,
  tilesZ: 100,
  standsWholeCatalogue: true,

  plots: [
    at('entrance', 42, 0),
    at('entrance', 42, 99),

    at('hotel', 3, 1),
    ...row('cypress', 4, 6, 3, 4),
    at('flowerbed', 6, 8),

    at('villa', 16, 1),
    at('villa', 21, 1),
    at('house', 26, 1),
    at('statue', 18, 6),
    at('flowerbed', 22, 6),
    at('olive', 26, 6),

    at('supermarket', 30, 1),
    at('restaurant', 35, 1),
    at('icecream', 40, 1),
    at('snack-bar', 40, 3),
    at('restrooms', 30, 5),
    at('game-hall', 32, 5),
    at('first-aid', 36, 5),
    at('coffee-shop', 39, 5),

    at('spa-pavilion', 44, 1),
    at('resort-bar', 48, 1),
    at('game-hall', 52, 1),
    at('first-aid', 44, 4),
    at('restrooms', 47, 4),
    at('snack-bar', 50, 4),
    at('tikitorch', 56, 1),
    at('reception', 44, 6),
    at('bakery', 49, 7),

    at('supermarket', 58, 1),
    at('restaurant', 63, 1),
    at('statue', 68, 1),
    at('snack-bar', 58, 5),
    at('icecream', 61, 5),
    at('restrooms', 63, 5),
    at('coffee-shop', 65, 5),
    at('palm', 68, 4),

    at('hotel', 72, 1),
    at('blossom', 74, 6),
    at('blossom', 78, 6),
    at('flowerbed', 76, 8),
    at('litter-bin', 72, 7),
    at('sign-post', 73, 7),
    at('picnic-table', 79, 7),
    at('lifeguard-tower', 81, 6),

    at('supermarket', 83, 1),
    at('restaurant', 88, 1),
    at('icecream', 93, 1),
    at('snack-bar', 93, 3),
    at('restrooms', 83, 5),
    at('game-hall', 85, 5),
    at('first-aid', 89, 5),
    at('palm', 93, 5),
    at('flowerbed', 93, 7),

    at('hotel', 97, 1),
    at('olive', 99, 6),
    at('olive', 103, 6),
    at('statue', 105, 6),
    at('flowerbed', 101, 7),

    ...block('cottage', 3, 11, 4, 2, 3, 4),
    ...row('bungalow', 3, 19, 3, 4),
    at('tennis-court', 3, 25),

    ...row('house', 16, 11, 4, 3),
    ...row('bungalow', 16, 15, 3, 4),
    ...row('cottage', 16, 19, 4, 3),
    at('playground', 16, 28),
    at('kids-club', 20, 28),

    at('swimming-pool', 30, 11),
    at('poolside-bar', 38, 11),
    at('tikitorch', 40, 11),
    at('changing-cabins', 38, 14),
    at('beach-shower', 40, 14),
    ...row('sun-lounger', 30, 18, 4, 1),
    ...row('beach-umbrella', 34, 18, 2, 2),
    at('willow', 39, 17),
    at('beach-club', 30, 20),
    at('resort-bar', 37, 20),
    ...row('cottage', 30, 28, 4, 3),

    at('minigolf', 44, 11),
    at('villa', 53, 11),
    at('tikitorch', 55, 16),
    ...row('bungalow', 44, 19, 3, 4),
    at('swimming-pool', 44, 23),
    at('poolside-bar', 53, 23),
    at('palm', 55, 23),
    ...row('sun-lounger', 44, 30, 4, 1),
    at('changing-cabins', 53, 26),
    at('beach-shower', 55, 26),
    // This plan has no sand, so the hire hut stands by the pool instead.
    at('pedalo-rental', 53, 29),

    at('beach-club', 58, 11),
    at('villa', 65, 11),
    at('tikitorch', 69, 11),
    at('villa', 58, 17),
    at('villa', 63, 17),
    ...row('house', 58, 22, 4, 3),
    ...row('bungalow', 58, 26, 3, 4),
    at('basketball-court', 60, 29),

    at('tennis-court', 72, 11),
    at('pine', 72, 17),
    ...row('bungalow', 74, 17, 2, 4),
    ...row('cottage', 72, 21, 3, 3),
    ...row('house', 72, 25, 3, 3),
    at('statue', 81, 21),

    at('swimming-pool', 83, 11),
    at('poolside-bar', 91, 11),
    at('tikitorch', 93, 11),
    at('changing-cabins', 91, 14),
    at('beach-shower', 93, 14),
    ...row('sun-lounger', 83, 18, 4, 1),
    at('beach-club', 83, 20),
    at('resort-bar', 90, 20),
    at('palm', 94, 20),
    ...row('cottage', 83, 26, 4, 3),
    ...row('bungalow', 83, 30, 3, 4),

    at('villa', 97, 11),
    at('villa', 102, 11),
    at('tikitorch', 107, 11),
    at('villa', 97, 16),
    at('villa', 102, 16),
    at('statue', 107, 16),
    ...row('house', 97, 21, 4, 3),
    ...row('bungalow', 97, 25, 3, 4),
    ...row('cottage', 97, 29, 4, 3),
    at('cypress', 109, 21),

    at('tennis-court', 3, 37),
    at('pine', 13, 37),
    at('minigolf', 3, 43),
    at('palm', 13, 43),
    ...row('cottage', 3, 51, 4, 3),
    at('volleyball', 3, 55),
    at('bungalow', 10, 55),

    ...row('house', 16, 37, 4, 3),
    ...row('bungalow', 16, 41, 3, 4),
    at('game-hall', 16, 45),
    at('spa-pavilion', 21, 45),
    at('first-aid', 24, 45),
    at('statue', 27, 45),
    at('minigolf', 16, 50),
    at('playground', 25, 50),
    at('gym-pavilion', 25, 54),

    at('swimming-pool', 30, 37),
    at('poolside-bar', 38, 37),
    at('tikitorch', 40, 37),
    ...row('sun-lounger', 38, 40, 4, 1),
    ...row('cottage', 30, 44, 4, 3),
    at('volleyball', 30, 48),
    at('resort-bar', 37, 48),

    at('beach-club', 45, 37),
    at('resort-bar', 51, 37),
    at('tikitorch', 55, 37),
    at('villa', 44, 43),
    at('villa', 49, 43),
    ...row('house', 44, 48, 4, 3),
    ...row('bungalow', 44, 52, 3, 4),

    at('swimming-pool', 58, 37),
    at('villa', 66, 37),
    ...row('cottage', 58, 44, 4, 3),
    ...row('bungalow', 58, 48, 3, 4),
    at('beach-club', 58, 52),
    at('resort-bar', 65, 52),

    at('villa', 72, 37),
    at('villa', 77, 37),
    at('olive', 72, 41),
    ...row('house', 72, 43, 3, 3),
    ...row('cottage', 72, 47, 3, 3),
    ...row('bungalow', 72, 51, 2, 4),

    at('minigolf', 83, 37),
    at('villa', 92, 37),
    at('tikitorch', 92, 41),
    ...row('cottage', 83, 45, 4, 3),
    ...row('bungalow', 83, 49, 3, 4),
    at('beach-club', 83, 53),
    at('resort-bar', 90, 53),
    at('blossom', 93, 53),
    at('playground', 90, 56),

    at('tennis-court', 97, 37),
    at('oak', 107, 37),
    at('minigolf', 97, 43),
    at('playground', 106, 43),
    at('statue', 109, 47),
    ...row('house', 97, 51, 4, 3),
    ...row('cottage', 97, 55, 4, 3),

    at('tennis-court', 3, 61),
    at('volleyball', 3, 67),
    at('playground', 10, 67),
    at('pine', 13, 61),
    at('palm', 13, 65),
    at('flowerbed', 13, 71),

    at('swimming-pool', 16, 61),
    at('game-hall', 24, 61),
    at('first-aid', 25, 65),
    at('fountain', 17, 68),
    at('statue', 20, 68),
    at('spa-pavilion', 22, 68),
    at('restrooms', 26, 68),

    at('supermarket', 30, 61),
    at('restaurant', 35, 61),
    at('snack-bar', 30, 65),
    at('icecream', 33, 65),
    at('restrooms', 35, 65),
    at('resort-bar', 38, 65),
    at('coffee-shop', 30, 68),
    at('playground', 36, 68),

    at('tennis-court', 44, 61),
    at('spa-pavilion', 54, 61),
    at('first-aid', 54, 64),
    at('volleyball', 44, 67),
    at('beach-club', 50, 67),
    at('palm', 56, 67),

    at('supermarket', 58, 61),
    at('restaurant', 63, 61),
    at('game-hall', 67, 61),
    at('snack-bar', 58, 65),
    at('icecream', 61, 65),
    at('restrooms', 63, 65),
    at('playground', 58, 68),
    at('coffee-shop', 63, 68),

    at('villa', 72, 61),
    at('villa', 77, 61),
    at('tennis-court', 72, 66),
    at('oak', 81, 61),
    at('cypress', 81, 66),

    at('supermarket', 83, 61),
    at('restaurant', 88, 61),
    at('game-hall', 92, 61),
    at('snack-bar', 83, 65),
    at('icecream', 86, 65),
    at('restrooms', 88, 65),
    at('first-aid', 90, 65),
    at('coffee-shop', 83, 68),
    at('playground', 89, 68),
    at('palm', 94, 68),

    at('villa', 97, 61),
    at('villa', 102, 61),
    at('cypress', 107, 61),
    at('tennis-court', 97, 66),
    at('olive', 107, 66),
    at('flowerbed', 107, 69),

    ...row('house', 3, 75, 4, 3),
    ...row('bungalow', 3, 79, 3, 4),
    ...row('cottage', 3, 82, 4, 3),
    at('playground', 3, 86),
    at('game-hall', 8, 85),
    at('palm', 12, 86),
    at('flowerbed', 12, 88),

    at('swimming-pool', 16, 75),
    at('poolside-bar', 24, 75),
    at('tikitorch', 26, 75),
    ...row('sun-lounger', 24, 78, 4, 1),
    at('beach-club', 16, 81),
    at('resort-bar', 22, 81),
    at('palm', 25, 81),
    ...row('bungalow', 16, 86, 3, 4),
    at('statue', 28, 86),

    at('villa', 30, 75),
    at('villa', 35, 75),
    at('cypress', 40, 75),
    ...row('cottage', 30, 80, 4, 3),
    at('first-aid', 30, 87),
    at('restrooms', 33, 87),
    at('snack-bar', 36, 87),
    at('icecream', 39, 87),
    at('palm', 40, 87),

    at('swimming-pool', 44, 75),
    at('villa', 52, 75),
    at('tikitorch', 56, 75),
    ...row('house', 44, 81, 4, 3),
    at('statue', 56, 81),
    at('olive', 56, 85),
    at('spa-pavilion', 44, 87),
    at('first-aid', 48, 87),
    at('restrooms', 51, 87),
    at('snack-bar', 54, 87),
    at('palm', 56, 87),

    at('tennis-court', 58, 75),
    at('oak', 68, 75),
    at('minigolf', 58, 81),
    at('playground', 67, 81),
    at('statue', 69, 85),

    at('villa', 72, 75),
    at('villa', 77, 75),
    at('pine', 81, 75),
    ...row('house', 72, 80, 3, 3),
    at('olive', 81, 80),
    ...row('bungalow', 72, 84, 2, 4),
    at('flowerbed', 81, 84),

    at('minigolf', 83, 75),
    at('villa', 92, 75),
    at('tikitorch', 92, 79),
    at('statue', 95, 81),
    at('swimming-pool', 83, 83),
    at('poolside-bar', 91, 83),
    at('palm', 93, 83),
    ...row('sun-lounger', 91, 86, 4, 1),

    at('beach-club', 97, 75),
    at('resort-bar', 103, 75),
    at('cypress', 106, 75),
    at('statue', 109, 80),
    ...row('house', 97, 81, 4, 3),
    ...row('cottage', 97, 85, 4, 3),
    at('palm', 109, 84),

    // Planting against the street and blocks against the edge, so every spur here is three
    // tiles straight up rather than a lane along the strip.

    at('flowerbed', 6, 91),
    ...row('cypress', 4, 92, 3, 4),
    at('hotel', 3, 94),

    at('statue', 18, 92),
    at('flowerbed', 22, 92),
    at('palm', 26, 92),
    at('villa', 16, 95),
    at('villa', 21, 95),
    at('house', 26, 95),

    at('restrooms', 30, 91),
    at('game-hall', 32, 91),
    at('first-aid', 36, 91),
    at('palm', 40, 91),
    at('supermarket', 30, 95),
    at('restaurant', 35, 95),
    at('icecream', 40, 95),
    at('snack-bar', 40, 97),

    at('first-aid', 44, 91),
    at('restrooms', 47, 91),
    at('snack-bar', 50, 91),
    at('palm', 53, 91),
    at('tikitorch', 55, 91),
    at('spa-pavilion', 44, 95),
    at('resort-bar', 48, 95),
    at('game-hall', 52, 95),
    at('palm', 56, 95),

    at('snack-bar', 58, 91),
    at('icecream', 61, 91),
    at('restrooms', 63, 91),
    at('palm', 68, 91),
    at('supermarket', 58, 95),
    at('restaurant', 63, 95),
    at('statue', 68, 95),

    at('flowerbed', 76, 91),
    at('cypress', 74, 92),
    at('cypress', 78, 92),
    at('hotel', 72, 94),

    at('snack-bar', 83, 91),
    at('icecream', 86, 91),
    at('restrooms', 88, 91),
    at('first-aid', 91, 91),
    at('palm', 94, 91),
    at('supermarket', 83, 95),
    at('restaurant', 88, 95),
    at('game-hall', 92, 95),

    at('flowerbed', 101, 91),
    at('blossom', 99, 92),
    at('blossom', 103, 92),
    at('statue', 107, 92),
    at('hotel', 97, 94),

    at('fountain', 42, 36),
  ],

  nodes: [
    { id: 'gate-n', tileX: 43, tileZ: 1 },
    { id: 'cross-n', tileX: 43, tileZ: 10 },
    { id: 'plaza', tileX: 43, tileZ: 36 },
    { id: 'cross-s', tileX: 43, tileZ: 60 },
    { id: 'cross-s2', tileX: 43, tileZ: 74 },
    { id: 'cross-s3', tileX: 43, tileZ: 90 },
    { id: 'gate-s', tileX: 43, tileZ: 98 },

    { id: 'north-w', tileX: 2, tileZ: 10 },
    { id: 'north-e', tileX: 110, tileZ: 10 },
    { id: 'avenue-w', tileX: 2, tileZ: 36 },
    { id: 'avenue-e', tileX: 110, tileZ: 36 },
    { id: 'south-w', tileX: 2, tileZ: 60 },
    { id: 'south-e', tileX: 110, tileZ: 60 },
    { id: 'south2-w', tileX: 2, tileZ: 74 },
    { id: 'south2-e', tileX: 110, tileZ: 74 },
    { id: 'south3-w', tileX: 2, tileZ: 90 },
    { id: 'south3-e', tileX: 110, tileZ: 90 },

    { id: 'lane-a-n', tileX: 15, tileZ: 10 },
    { id: 'lane-a-s', tileX: 15, tileZ: 90 },
    { id: 'lane-b-n', tileX: 29, tileZ: 10 },
    { id: 'lane-b-s', tileX: 29, tileZ: 90 },
    { id: 'lane-c-n', tileX: 57, tileZ: 10 },
    { id: 'lane-c-s', tileX: 57, tileZ: 90 },
    { id: 'lane-d-n', tileX: 71, tileZ: 10 },
    { id: 'lane-d-s', tileX: 71, tileZ: 90 },
    { id: 'lane-e-n', tileX: 82, tileZ: 10 },
    { id: 'lane-e-s', tileX: 82, tileZ: 90 },
    { id: 'lane-f-n', tileX: 96, tileZ: 10 },
    { id: 'lane-f-s', tileX: 96, tileZ: 90 },
  ],

  edges: [
    { from: 'gate-n', to: 'cross-n', width: 2 },
    { from: 'cross-n', to: 'plaza', width: 2 },
    { from: 'plaza', to: 'cross-s', width: 2 },
    { from: 'cross-s', to: 'cross-s2', width: 2 },
    { from: 'cross-s2', to: 'cross-s3', width: 2 },
    { from: 'cross-s3', to: 'gate-s', width: 2 },

    { from: 'north-w', to: 'north-e', width: 2 },
    { from: 'avenue-w', to: 'avenue-e', width: 2 },
    { from: 'south-w', to: 'south-e', width: 2 },
    { from: 'south2-w', to: 'south2-e', width: 2 },
    { from: 'south3-w', to: 'south3-e', width: 2 },

    { from: 'north-w', to: 'south-w' },
    { from: 'south-w', to: 'south3-w' },
    { from: 'north-e', to: 'south-e' },
    { from: 'south-e', to: 'south3-e' },

    { from: 'lane-a-n', to: 'lane-a-s' },
    { from: 'lane-b-n', to: 'lane-b-s' },
    { from: 'lane-c-n', to: 'lane-c-s' },
    { from: 'lane-d-n', to: 'lane-d-s' },
    { from: 'lane-e-n', to: 'lane-e-s' },
    { from: 'lane-f-n', to: 'lane-f-s' },
  ],

  plazas: [{ x0: 41, x1: 44, z0: 34, z1: 37 }],
};
