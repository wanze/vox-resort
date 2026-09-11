/**
 * Beach shower: a timber post on a duckboard with an arm out over it, a rose on
 * the end of the arm and the water coming off it, with a towel rail standing
 * behind. 16x12x16 (4 x 3 x 4 m), a 1x1 tile. The arm reaches +z, which on a
 * generated beach is the water.
 *
 * The slab is the two layers of `sand` the beach props stand on, so the shower
 * reads as standing on the beach rather than on a plinth dropped onto it, and it
 * is what fills the tile the model claims. See `lifeguard-tower.ts`.
 *
 * **The stream is painted, not declared.** A colour in the `water` field is
 * meshed into the sea's shader, and that shader describes a *horizontal*
 * surface: it never displaces a vertex, samples its phase from `positionWorld.xz`
 * and hands back a normal that always points up. A falling sheet shaded with it
 * takes one phase down its whole height and lights as though it were lying flat.
 * So the stream is `water.light` painted like any other albedo — the same choice
 * the pool's shower post makes, and the one `docs/art-direction.md` records under
 * _Water is a shader, not a colour_.
 *
 * **It stops two courses above the duckboard.** A column of blue run into the
 * boards is a blue post; a column that ends in air is spray. The boards under it
 * take `teak.deep` instead, which is what wet timber is — a darker material
 * rather than a shadow painted on a lighter one.
 *
 * **Timber rather than the chromed metal a real one is.** The pool's shower
 * found this first: a grey post on a grey deck is a post nobody sees, and on
 * pale sand it is worse. The rose stays `metal`, because it is 50 cm of fitting
 * at the top of the post and the one place the eye needs to land.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The slab, which is the whole tile: a model fills the footprint it claims. */
const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

/** First free layer above the slab, where the boards are laid. */
const GROUND = SLAB.height;

/** The duckboard: 8 voxels square, 2 m of somewhere to stand out of the sand. */
const DECK = { x: 4, x1: 11, z: 5, z1: 12 } as const;

/** The post, two voxels square at the back of the boards. */
const POST = { x: 7, x1: 8, z: 5, z1: 6 } as const;

/** The layer the arm lies in: 2.25 m over the boards, so nobody walks into it. */
const ARM = GROUND + 9;

/**
 * The row the rose hangs over.
 *
 * Four voxels clear of the post rather than one. A stream falling against the
 * post is one mass with it from every angle the plot is seen at, and a metre of
 * daylight between the two is what makes the arm read as an arm.
 */
const ROSE = 10;

export default defineModel({
  id: 'beach-shower',
  label: 'Beach Shower',
  category: 'amenities',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, metal, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    // The boards, one course proud of the sand, and the wet patch the stream
    // lands on.
    box(DECK.x, DECK.x1, GROUND, GROUND, DECK.z, DECK.z1, teak.shade);
    box(POST.x, POST.x1, GROUND, GROUND, ROSE - 1, ROSE + 1, teak.deep);

    // The post, the arm cantilevered off the top of it, and the rose under the
    // end of the arm.
    box(POST.x, POST.x1, GROUND, ARM - 1, POST.z, POST.z1, teak.base);
    box(POST.x, POST.x1, ARM, ARM, POST.z, ROSE, teak.base);
    box(POST.x, POST.x1, ARM - 1, ARM - 1, ROSE, ROSE, metal.light);

    // The water: four courses hanging under the rose and stopping in mid-air, a
    // metre clear of the boards. Run all the way down it is a blue post; hung
    // under the rose and ended short it is spray.
    box(POST.x, POST.x1, ARM - 5, ARM - 2, ROSE, ROSE, PALETTE.water.light);

    // The towel rail down the west side of the boards, on the sand rather than
    // on them: two uprights, a bar between them and two towels over it. It is
    // what fills the rest of the tile, and it is the one thing here with a soft
    // edge.
    //
    // Beside the shower rather than behind it, which is the same rule the
    // stream above follows: anything standing on the post's own row is hidden by
    // the post from half the angles the plot is seen at.
    const bar = GROUND + 5;
    const rail = DECK.x - 2;
    for (const z of [DECK.z, DECK.z1]) box(rail, rail, GROUND, bar, z, z, teak.base);
    box(rail, rail, bar, bar, DECK.z, DECK.z1, teak.light);
    box(rail, rail, GROUND + 2, bar, DECK.z + 2, DECK.z + 3, stucco.light);
    box(rail, rail, GROUND + 2, bar, DECK.z1 - 2, DECK.z1 - 1, bloom.base);
  },
});
