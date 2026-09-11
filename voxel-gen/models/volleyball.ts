/**
 * Beach volleyball court: a single course of raked sand with a taped boundary, a
 * net strung between two posts across the middle, and a ball lying where
 * somebody left it. 64x11x32 (16 x 8 m), a 4x2 tile — which is the court a beach
 * volleyball court actually is, to the metre.
 *
 * **One course of sand, not the catalogue's two.** Every other object on the
 * plot stands on a slab: a plinth two or three layers deep with a darker lip
 * round its top edge, which is what makes a thing read as a plot with something
 * on it rather than as a sticker on the grass. A court is the one thing that
 * must not — volleyball is played *in* the sand, and a court raised 50 cm with a
 * kerb round it is a stage. So this lays a single course, in `sand.base` and with
 * no lip at all, and the beach it is cut into is drawn 0.3 voxels up, so the
 * court stands 17 cm proud of it and reads as flush. Inland, where the generator
 * also stands one, the same course reads as a sand court set into a lawn.
 *
 * It is still a full course rather than nothing, and that is not timidity: the
 * blob shadows are cast *beside* an object on the understanding that the half of
 * the quad still under it is hidden by the object's own ground plate, so a court
 * with no plate would have a shadow lying visibly across it. See
 * `rendering/domain/blobShadows.ts`.
 *
 * **The lines run to the footprint's own edge**, which is the other half of
 * taking the platform away. Inset, they were a court drawn smaller than the tiles
 * it claimed, with a border of sand around it that had to come from somewhere —
 * and where it came from was the platform. At the edge they are simply the 16 x 8
 * m the footprint already is.
 *
 * **The net is a solid plane.** A net is holes, and holes are the one thing this
 * grid must not draw — a mesh at one voxel a strand is a dither across a face,
 * which costs more triangles than a hotel and reads as noise from the height the
 * ground is ever seen at. One flat band of canvas with a lighter tape along its
 * top is what a net looks like from thirty metres, and it is three rectangles.
 *
 * **The net stands at the right height, which is what makes the court read.**
 * Nine voxels over the court surface is 2.25 m, and the band under the tape is a
 * metre, so the whole thing is measured off the court rather than off the model.
 */
import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The court, which is the whole footprint: a model fills what it claims. */
const COURT = { x1: 63, z1: 31 } as const;

/** The layer the sand and its markings share, and the first free layer over it. */
const SURFACE = 0;
const GROUND = SURFACE + 1;

/** The two net posts, on the middle of the long axis. */
const POST = { x: 31, x1: 32 } as const;

/** Layers of post above the court. Eleven is two and three quarter metres. */
const POST_HEIGHT = 11;

/** Layers of net under its tape. Four is the metre a net actually is. */
const NET_HEIGHT = 4;

export default defineModel({
  id: 'volleyball',
  label: 'Volleyball Court',
  category: 'leisure',
  tiles: { x: 4, z: 2 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, sand, stucco, teak } = PALETTE;

    // The court: one course of sand across the whole footprint, no lip.
    box(0, COURT.x1, SURFACE, SURFACE, 0, COURT.z1, sand.base);

    // The boundary, laid into that same course so nothing is raised: four
    // rectangles round the edge of the footprint, as a court is taped out.
    box(0, COURT.x1, SURFACE, SURFACE, 0, 0, stucco.light);
    box(0, COURT.x1, SURFACE, SURFACE, COURT.z1, COURT.z1, stucco.light);
    box(0, 0, SURFACE, SURFACE, 0, COURT.z1, stucco.light);
    box(COURT.x1, COURT.x1, SURFACE, SURFACE, 0, COURT.z1, stucco.light);

    // The posts, just outside the sidelines, as they stand on a real court.
    const top = GROUND + POST_HEIGHT - 1;
    for (const z of [1, COURT.z1 - 2]) {
      box(POST.x, POST.x1, GROUND, top, z, z + 1, teak.base);
    }

    // The net: one voxel of shaded canvas under one voxel of lighter tape.
    // Thin and dark on purpose — hung two voxels thick in the light tone it
    // read as a wall across the court rather than as something you can see a
    // rally through, and a net is a hole in the air. The posts stay two thick,
    // which is what leaves them reading as posts beside it.
    const tape = top - 1;
    box(POST.x, POST.x, tape - NET_HEIGHT + 1, tape - 1, 2, COURT.z1 - 2, stucco.shade);
    box(POST.x, POST.x, tape, tape, 2, COURT.z1 - 2, stucco.light);

    // The ball, left on the sand at one end of the court: a 50 cm cube with one
    // red half. Two rectangles, because it is dressing — and dressing is what
    // tells you the court is played on rather than swept and photographed.
    box(12, 13, GROUND, GROUND + 1, 14, 15, stucco.light);
    box(12, 13, GROUND, GROUND + 1, 14, 14, bloom.base);
  },
});
