/**
 * Plaza fountain: three octagonal bowls of falling water on a stepped stone
 * pedestal, the lowest sunk into the pedestal itself. 32x32x15 (8 x 8 m, 3.75 m
 * to the lip of the top cup), a 2x2 tile filled edge to edge.
 *
 * Every drop of water in it is `PALETTE.water.base`, declared below as this
 * model's water, so all three surfaces are meshed apart and shaded by
 * `poolWaterMaterial.ts` with the pool's own ripple, glint and sky. The bowls
 * are painted in **one flat tone**: the model this replaces dithered a second
 * blue across its surface at `(x + z) % 5`, which defeats the water merge as
 * well as the coplanar one. See _Water is a shader, not a colour_ in
 * `docs/art-direction.md`.
 *
 * **Nothing in it is painted water, and that is the point.** An earlier draft of
 * this pass drew the fountain running — four sheets of `water.light` spilling
 * between the bowls and a jet standing two metres out of the top one — on the
 * reasoning that a colour declared as water is water *everywhere*, so a falling
 * stream had to stay a painted surface or it would ripple in mid-air. That
 * reasoning is right and the result was still wrong: `waterSurface.ts` bends a
 * shading normal rather than moving a vertex, and it does it from `positionWorld.xz`
 * about a normal that always points **up**. A horizontal surface is exactly what
 * that describes and a vertical one is exactly what it does not — a falling
 * sheet would shade as though it were lying flat, with one phase down its whole
 * height. So the choice here is not between a static stream and an animated one;
 * it is between a static stream and no stream, and the third bowl is what
 * replaces it. Water that moves is horizontal water, and a tier is how this grid
 * says a fountain is running.
 *
 * It is also **shorter**, twice over and for the same reason. Taking the jet off
 * took 7 of its 24 layers; shortening {@link COLUMN} by 3 then dropped the upper
 * two bowls onto the lower one, which took 3 more. A plaza ornament reads better
 * at 3.75 m than at 6 — it is something to walk round rather than to look up at,
 * and the three tiers nest instead of stacking. The column is the one number to
 * turn: everything above it rides on the capital, so its height *is* the
 * fountain's height.
 *
 * **It is an octagon because it cannot be a circle.** The model it replaces was
 * three concentric rings found with `Math.hypot`, each a staircase on a 25 cm
 * grid with nothing in it coplanar with anything else — the poolside bar's
 * counter exactly. An octagon is eight straight runs, it merges into a handful
 * of rectangles, and from the 30 degrees the resort is seen at it reads as round
 * anyway.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const N = 31;

/** Centre of the footprint, measured against voxel centres so both axes match. */
const C = 16;

/**
 * The apron, and the pedestal standing on it.
 *
 * Two tiers rather than one: the apron is two layers, level with the paving of
 * the plaza the fountain stands in the middle of, and the pedestal is two more
 * on top of it and inset four, so the thing reads as stepped from every side
 * and a basin can be sunk into it without the plot becoming a pit.
 */
const APRON = { x: 0, z: 0, w: N + 1, d: N + 1, height: 2 } as const;
const PEDESTAL = { x: 4, z: 4, w: 24, d: 24, y: 2, height: 2 } as const;

interface Bowl {
  /** Half the width across the flats, measured from the centre of the plot. */
  readonly reach: number;
  /** How far the four corners are cut back off that, which makes it an octagon. */
  readonly chamfer: number;
  /** Rings of coping between the outline and the water, so the rim reads. */
  readonly rim: number;
}

/**
 * The three bowls, widest first: 20 voxels across the flats, then 12, then 6.
 *
 * Each is a little over half the one below it, which is what makes a stack of
 * three read as one cascading object rather than as three plates on a post.
 */
const LOWER: Bowl = { reach: 10, chamfer: 5, rim: 2 };
const MIDDLE: Bowl = { reach: 6, chamfer: 3, rim: 1 };
const TOP: Bowl = { reach: 3, chamfer: 1, rim: 1 };

/** The column between the lowest two bowls, and the stem between the upper two. */
const COLUMN = { x0: 13, x1: 18, height: 5 } as const;
const STEM = { x0: 14, x1: 17, height: 3 } as const;

export default defineModel({
  id: 'fountain',
  label: 'Fountain',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  /** All three bowls, drawn with the pool's shader rather than as flat blue. */
  water: [PALETTE.water.base],
  /**
   * Submerged floods, the way the swimming pool lights its basins: no voxel
   * emits them, the water is simply lit from under the surface after dark.
   * Two rather than four — this is a plaza ornament, not a pool terrace.
   */
  lights: [
    { x: 11, y: 2, z: 16, color: PALETTE.water.light, intensity: 90, distance: 52 },
    { x: 21, y: 2, z: 16, color: PALETTE.water.light, intensity: 90, distance: 52 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stone, water } = PALETTE;

    /**
     * Whether a cell falls inside an octagon of this reach about the centre.
     *
     * The square test gives the four flats and the diagonal one cuts the four
     * corners, which is the whole shape: every edge it produces is axis-aligned
     * or a 45-degree stair of single voxels, and the flats — which are most of
     * the outline — merge into one rectangle each.
     */
    const inside = (x: number, z: number, reach: number, chamfer: number): boolean => {
      const dx = Math.abs(x + 0.5 - C);
      const dz = Math.abs(z + 0.5 - C);
      return dx <= reach && dz <= reach && dx + dz <= reach + chamfer;
    };

    /** Lays the body a raised bowl stands on, before the bowl is cut into it. */
    const pad = (y0: number, y1: number, o: Bowl): void => {
      for (let x = 0; x <= N; x++) {
        for (let z = 0; z <= N; z++) {
          if (inside(x, z, o.reach, o.chamfer)) box(x, x, y0, y1, z, z, stone.base);
        }
      }
    };

    /**
     * Sinks a bowl into whatever it is standing on and fills it.
     *
     * Drawn the way `poolWater` draws a basin, which is the part this would be
     * if the part took an octagon: the rim is the outline seen from both sides —
     * solid coping from the floor up, so it is the wall the water stands
     * against — and inside it the deck's own top layer is removed, which is
     * what makes the water read as recessed rather than as a blue lid. It is
     * not `poolWater` itself only because that part cuts a rectangle or an
     * inscribed ellipse, and an ellipse here is the staircase this pass exists
     * to remove.
     */
    const bowl = (deck: number, depth: number, o: Bowl): void => {
      const floor = deck - depth;
      for (let x = 0; x <= N; x++) {
        for (let z = 0; z <= N; z++) {
          if (!inside(x, z, o.reach, o.chamfer)) continue;
          if (inside(x, z, o.reach - o.rim, o.chamfer)) {
            box(x, x, floor, deck - 1, z, z, water.base);
            b.del(x, deck, z);
          } else {
            box(x, x, floor, deck, z, z, stone.light);
          }
        }
      }
    };

    // The stepped ground: apron to the edge of the footprint, pedestal on it.
    plinth(b, APRON);
    const top = plinth(b, PEDESTAL) - 1;

    // The lower basin, 50 cm of water sunk into the pedestal.
    bowl(top, 2, LOWER);

    /**
     * The column out of the middle of it, and the second bowl on its capital.
     *
     * The column stands on the basin floor rather than on the pedestal, so it
     * rises *through* the water the way a fountain's does. Its capital is one
     * course wider, which is the overhang that stops the bowl from looking
     * balanced on a post.
     */
    const foot = top - 2;
    const capital = foot + COLUMN.height + 1;
    box(COLUMN.x0, COLUMN.x1, foot, capital - 1, COLUMN.x0, COLUMN.x1, stone.base);
    box(COLUMN.x0 - 1, COLUMN.x1 + 1, capital, capital, COLUMN.x0 - 1, COLUMN.x1 + 1, stone.shade);

    const middle = capital + 2;
    pad(capital + 1, middle, MIDDLE);
    bowl(middle, 1, MIDDLE);

    // The stem, and the cup on top of it: the smallest surface of water in the
    // resort, and the one that gives the fountain its top from 30 degrees above.
    const crest = middle + STEM.height + 2;
    box(STEM.x0, STEM.x1, middle + 1, crest - 2, STEM.x0, STEM.x1, stone.base);
    pad(crest - 1, crest, TOP);
    bowl(crest, 1, TOP);
  },
});
