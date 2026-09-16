/**
 * The beach as somewhere to go: the one venue on the plot that is not a building.
 *
 * Without it the sand had no part in anybody's decisions. A guest stepped onto
 * it only by chance at a gate, and a guest with an errand - which is nearly every
 * guest, nearly all day - is routed along streets that seldom pass one, so after
 * the first night the beach stayed empty. Now a guest who wants some fun or a
 * rest can choose the beach the way they choose a minigolf course: walk to the
 * nearest gate, spend the visit out on the sand, and come back.
 *
 * ## One venue for the whole band, entered at any gate
 *
 * Every gate is a door, so its flow field is one sweep from all of them and a
 * guest walks to whichever is nearest. Splitting the beach into a venue per gate
 * would put twenty-eight near-identical candidates in front of `chooseVenue` and
 * as many fields behind them, to say what one does.
 *
 * ## Declared here rather than on the art
 *
 * `plans/README.md`'s decision 4 puts sim facts on `VoxelModelSource`, so a new
 * model needs no change in `src/`. The beach is the exception that has no model
 * to put them on: it is terrain, drawn by the shore. The numbers live beside the
 * one function that turns them into a `Venue`, which is as near to "on the art"
 * as sand gets.
 *
 * ## A visit is a stay at a pitch
 *
 * Arriving at a building stands a guest still inside it. Arriving at the beach
 * walks them out over the sand to a spot at their party's pitch - on a lounger,
 * or lying or sitting on the sand - and holds them there for the visit, then
 * walks them back to the gate. See `beachPitch.ts` for where a party settles,
 * and `router.ts` for the walk.
 */

import type { NeedRelief } from '../../../../voxel-gen/voxelgen.ts';
import type { WalkNetwork } from '../../crowd/domain/walkNetwork';
import type { Venue } from './venues';

/** The beach's key, which no placement key can be: those are `id#n`. */
const BEACH_KEY = 'beach';

/**
 * What an afternoon on the sand does for somebody: a good share of fun, below
 * the pool's 0.8 and the waterpark's 1, and a real rest, which an hour on a
 * lounger is.
 *
 * **The two numbers that decide how busy the beach is**, because the beach is
 * within reach of everywhere - a gate is never far - so `chooseVenue` weighs it
 * against every pool and court on relief almost alone. Measured over ten
 * simulated hours of the default resort with 570 guests, as visits to the beach
 * against the most anybody was resting on the sand at once:
 *
 * - 0.6 / 0.2, what this began with: 210 visits, 22 on the sand;
 * - 0.7 / 0.3, these: 678 visits, 65 on the sand;
 * - 0.85 / 0.35: 880 visits, 70 on the sand, and the pool and the courts all but
 *   stop being chosen at all.
 */
const BEACH_RELIEF: readonly NeedRelief[] = [
  { need: 'fun', amount: 0.7 },
  { need: 'energy', amount: 0.3 },
];

/**
 * How long a visit to the beach lasts, in simulated seconds: three quarters of
 * an hour to two hours. Longer than any building's, because a beach is where an
 * afternoon goes.
 */
const BEACH_DWELL_SECONDS = { min: 45 * 60, max: 120 * 60 } as const;

/**
 * How many the beach holds. It has no door to queue at and no roof to fit
 * under, so as many as the whole resort: nobody is ever turned away or stood in
 * a line, and `chooseVenue`'s queue term never weighs anything.
 */
const BEACH_CAPACITY = 100_000;

/**
 * The beach as a venue, or null on a plot with no beach or no gate onto it.
 *
 * Its middle is the middle of the gates, which is only ever what a straight
 * line is measured to before the router has swept its field - and the router
 * sweeps it on the first guest who considers it.
 */
export function beachVenueFor(network: WalkNetwork): Venue | null {
  const { gates, nodes } = network;
  if (!network.beach || gates.length === 0) return null;
  let x = 0;
  let z = 0;
  for (const gate of gates) {
    x += nodes[gate]!.x;
    z += nodes[gate]!.z;
  }
  const first = nodes[gates[0]!]!;
  return {
    key: BEACH_KEY,
    id: BEACH_KEY,
    label: 'Beach',
    role: 'activity',
    satisfies: BEACH_RELIEF,
    capacity: BEACH_CAPACITY,
    dwellSeconds: BEACH_DWELL_SECONDS,
    x: x / gates.length,
    z: z / gates.length,
    tileX: first.tileX,
    tileZ: first.tileZ,
    tilesX: 1,
    tilesZ: 1,
    doors: [],
  };
}

/** Whether a venue is the beach rather than a building. */
export function isBeach(venue: Venue): boolean {
  return venue.key === BEACH_KEY;
}
