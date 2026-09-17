/**
 * Beach volleyball court: a single course of raked sand with a taped 16 x 8 m
 * court in the middle of it, a net strung between two posts, a ball lying where
 * somebody left it, and a bench and a parasol out in the run-off.
 * 96x11x64 (24 x 16 m), a 6x4 tile.
 *
 * **The court is not the whole footprint any more.** A beach court is 16 x 8 m
 * of lines inside a free zone at least 3 m deep all round, and the model was the
 * lines alone — a court nobody could run off, drawn smaller than everything
 * beside it. The tape is where it always was relative to the net, and there is
 * 4 m of sand either side of it.
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
import { parasol } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The sand, which is the whole footprint: a model fills what it claims. */
const PLOT = { x1: 95, z1: 63 } as const;

/** The taped court, 16 x 8 m, in the middle of the sand. */
const COURT = { x0: 16, x1: 79, z0: 16, z1: 47 } as const;

/** The layer the sand and its markings share, and the first free layer over it. */
const SURFACE = 0;
const GROUND = SURFACE + 1;

/** The two net posts, on the middle of the long axis. */
const POST = { x: 47, x1: 48 } as const;

/** Layers of post above the court. Eleven is two and three quarter metres. */
const POST_HEIGHT = 11;

/** Layers of net under its tape. Four is the metre a net actually is. */
const NET_HEIGHT = 4;

export default defineModel({
  id: 'volleyball',
  label: 'Volleyball Court',
  category: 'leisure',
  placement: { ground: 'beach', perResort: { min: 1, max: 3 } },
  venue: {
    // raked sand under the sky.
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ],
    capacity: 12,
    dwellSeconds: { min: 1200, max: 2700 },
  },
  tiles: { x: 6, z: 4 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, sand, stucco, teak } = PALETTE;

    // The sand: one course across the whole footprint, no lip.
    box(0, PLOT.x1, SURFACE, SURFACE, 0, PLOT.z1, sand.base);

    // The boundary, laid into that same course so nothing is raised: four
    // rectangles, as a court is taped out.
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z0, stucco.light);
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z1, COURT.z1, stucco.light);
    box(COURT.x0, COURT.x0, SURFACE, SURFACE, COURT.z0, COURT.z1, stucco.light);
    box(COURT.x1, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, stucco.light);

    // The posts, a metre outside the sidelines, as they stand on a real court.
    const top = GROUND + POST_HEIGHT - 1;
    for (const z of [COURT.z0 - 5, COURT.z1 + 4]) {
      box(POST.x, POST.x1, GROUND, top, z, z + 1, teak.base);
    }

    // The net: shaded canvas under one voxel of lighter tape, running from post
    // to post. Thin and dark on purpose — hung two voxels thick in the light
    // tone it read as a wall across the court rather than as something you can
    // see a rally through.
    const tape = top - 1;
    const netZ0 = COURT.z0 - 3;
    const netZ1 = COURT.z1 + 3;
    box(POST.x, POST.x, tape - NET_HEIGHT + 1, tape - 1, netZ0, netZ1, stucco.shade);
    box(POST.x, POST.x, tape, tape, netZ0, netZ1, stucco.light);

    // The ball, left on the sand at one end of the court: a 50 cm cube with one
    // red half. Two rectangles, because it is dressing — and dressing is what
    // tells you the court is played on rather than swept and photographed.
    box(28, 29, GROUND, GROUND + 1, 30, 31, stucco.light);
    box(28, 29, GROUND, GROUND + 1, 30, 30, bloom.base);

    // Out in the run-off, beyond the east baseline: a plank bench for the team
    // waiting to play on, and a parasol for their bags.
    box(86, 87, GROUND, GROUND + 1, 22, 22, teak.shade);
    box(86, 87, GROUND, GROUND + 1, 33, 33, teak.shade);
    box(86, 87, GROUND + 2, GROUND + 2, 22, 33, teak.base);
    parasol(b, { x: 90, z: 42, y: GROUND, reach: 3 });
    box(88, 89, GROUND, GROUND + 1, 44, 45, bloom.base);
  },
});
