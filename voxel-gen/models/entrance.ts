/**
 * Resort gate: two banded stone piers carrying a blank architrave over a 8 m
 * carriageway, with the wrought-iron leaves swung **open** back against the
 * piers, a lantern let into each pier face and one standing on the cornice over
 * each. 64x16x39 (16 x 4 m, 9.75 m to the top of the lanterns), a 4x1 tile.
 *
 * Three things were asked of this pass and the model is drawn round them.
 *
 * **The door is open.** The gate it replaces described itself as open and was
 * drawn shut: a single grille of bars ran the full 22 voxels between the piers,
 * so the one object on the plot that exists to be walked through was barred
 * across. The leaves are now where an open gate's leaves are — folded back
 * along the inner face of each pier, running in z rather than in x — and the
 * carriageway is clear from the paving to the architrave. It is also the reason
 * the plot grew: two leaves need somewhere to fold *to*.
 *
 * **It is bigger**, from 3x1 tiles to 4x1 and from 7 m tall to 9.75. Four tiles
 * is not an arbitrary step. The promenade is two tiles wide and the gate stands
 * on its end, so at three tiles the carriageway was narrower than the street
 * through it and the piers stood in the road; at four, the opening is exactly
 * the promenade's own two tiles and each pier takes a tile of verge. The gate is
 * the first object anybody sees, and it is now the second-tallest thing on the
 * plot after the hotel.
 *
 * **It is lit**, and lit in the way the lane allows rather than by hanging lamps
 * on it. Each pier has a niche cut *into* its face with the light behind it —
 * an opening in a wall, which is the one move `docs/art-direction.md` asks of
 * every opening in this resort — and a lantern stands on the cornice above each,
 * which is what the eye reads from across the plot. Four burning faces, two
 * lamps declared: the niches light the carriageway and the lanterns light the
 * approach.
 *
 * Everything is symmetric front to back, which is not decoration either. The
 * layout turns a plot to face the street it is nearest, and there are two of
 * these — one at each end of the promenade, turned opposite ways — so the
 * nameplate, the niches and the planting are drawn on both faces and the gate
 * reads the same arriving and leaving.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 63;
const NZ = 15;

/**
 * The slab, two layers rather than the catalogue's three.
 *
 * `PAVING_VOXELS` is two and the promenade runs straight through this object,
 * so a gate on a three-layer plinth would be a step in the middle of the
 * resort's main street. Flush, you walk through it.
 */
const SLAB = { x: 0, z: 0, w: NX + 1, d: NZ + 1, height: 2 } as const;

/** First free layer above the slab: the road surface, and the piers' footing. */
const GROUND = SLAB.height;

/** The carriageway, which is the promenade's own two tiles, 8 m across. */
const ROAD = { x0: 16, x1: 47 } as const;

/** The piers: a spread footing, a banded shaft, and the courses down it. */
const FOOT = { x0: 2, x1: 15, z0: 1, z1: 14 } as const;
const SHAFT = { x0: 4, x1: 13, z0: 3, z1: 12 } as const;
const COURSES = [4, 10, 16, 22] as const;

/**
 * The head of the opening, and the entablature over it, as the layer each
 * course starts at.
 *
 * It is profiled rather than one slab, and that is the whole of what stops a
 * gate this wide from reading as a wall with a hole in it. The corbels step in
 * over the opening, the frieze steps in *again* — one voxel off the pier on
 * each side in z, which is where the nameplate is cut — and the cornice
 * oversails the lot. Drawn flush, as one 58 x 9 x 14 block, the top of this
 * model was half of what you saw of it and none of it had an edge.
 */
const CORBEL = 26;
const BEAM = 28;
const CORNICE = 34;
const CAP = 36;

/** How far the frieze is set back off the piers, which is the shadow line. */
const FRIEZE = { z0: 4, z1: 11 } as const;

/** The niche cut into each pier face, and the lantern standing over each pier. */
const NICHE = { x0: 8, x1: 9, y0: 18, y1: 20 } as const;
const BEACON = { x0: 7, x1: 10, z0: 6, z1: 9 } as const;

/** A gate leaf, folded back along the inner face of its pier. */
const LEAF = { z0: 4, z1: 11, bars: [4, 6, 8, 10] as const, height: 18 } as const;

/**
 * The one colour that burns after dark: `amber.light`, the lantern every other
 * lit thing in the resort hangs — the bars, the taverna, the mini-golf bollards
 * and the tennis floodlights. A gate is the last place to invent a new one.
 */
const LANTERN = PALETTE.amber.light;

/** Mirrors an x across the footprint, which is how the second pier is drawn. */
const mirror = (x: number): number => NX - x;

export default defineModel({
  id: 'entrance',
  label: 'Entrance',
  category: 'amenities',
  tiles: { x: 4, z: 1 },
  // The way in and out of the resort: guests check in here and walk out through
  // it when their stay is over. See `gateway` in `voxelgen.ts`.
  gateway: true,
  emissive: [LANTERN],
  lights: [
    // The two beacons on the cornice, which are what lights the approach.
    { x: 8, y: CAP + 2, z: 8, color: LANTERN, intensity: 110, distance: 60 },
    { x: mirror(8), y: CAP + 2, z: 8, color: LANTERN, intensity: 110, distance: 60 },
    // The niches, low and short-reaching: they light the way through, not the
    // plot. Declared once per pier rather than once per face — a lamp is bake
    // time, and two faces of one pier are one lamp in the middle of it.
    { x: 8, y: NICHE.y0 + 1, z: 8, color: LANTERN, intensity: 45, distance: 32 },
    { x: mirror(8), y: NICHE.y0 + 1, z: 8, color: LANTERN, intensity: 45, distance: 32 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, stone, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    /**
     * The threshold: the carriageway laid a step lighter than the verge either
     * side of it, so the way through reads as a road rather than as a gap.
     *
     * One flat rectangle. The road is the largest surface in the model and it
     * is the last place to want a cobble pattern — see the mini-golf course,
     * where the ground *was* the model and the ground was the whole cost of it.
     */
    box(ROAD.x0, ROAD.x1, GROUND - 1, GROUND - 1, 0, NZ, stone.light);

    /**
     * A pier: a footing two voxels proud all round, a shaft with a band every
     * 1.5 m up it, and a niche cut into both faces with the light behind.
     *
     * The niche is the model in miniature. It is an opening **into** the wall
     * rather than a lamp bolted onto it, which is the lane's rule for every
     * window and door in the resort, and it costs one `del` and one face of
     * colour — the glow comes from `emissive`, which is free.
     */
    const pier = (flip: boolean): void => {
      const at = (x: number): number => (flip ? mirror(x) : x);
      const [fx0, fx1] = [Math.min(at(FOOT.x0), at(FOOT.x1)), Math.max(at(FOOT.x0), at(FOOT.x1))];
      const [sx0, sx1] = [
        Math.min(at(SHAFT.x0), at(SHAFT.x1)),
        Math.max(at(SHAFT.x0), at(SHAFT.x1)),
      ];

      box(fx0, fx1, GROUND, GROUND + 1, FOOT.z0, FOOT.z1, stone.shade);
      box(sx0, sx1, GROUND + 2, CORBEL - 1, SHAFT.z0, SHAFT.z1, stone.base);
      for (const y of COURSES) box(sx0, sx1, y, y, SHAFT.z0, SHAFT.z1, stone.shade);

      // The corbels: two courses stepped in over the head of the opening, which
      // is as much of a springing arch as a 25 cm grid can draw without turning
      // it into a staircase nothing in it is coplanar with.
      const inner = flip ? at(SHAFT.x0) + 1 : at(SHAFT.x0) - 1;
      box(
        Math.min(inner, at(SHAFT.x0)),
        Math.max(inner, at(SHAFT.x0)),
        CORBEL,
        BEAM - 1,
        SHAFT.z0,
        SHAFT.z1,
        stone.light,
      );

      const [nx0, nx1] = [
        Math.min(at(NICHE.x0), at(NICHE.x1)),
        Math.max(at(NICHE.x0), at(NICHE.x1)),
      ];
      for (const [face, behind] of [
        [SHAFT.z1, SHAFT.z1 - 1],
        [SHAFT.z0, SHAFT.z0 + 1],
      ] as const) {
        for (let x = nx0; x <= nx1; x++) {
          for (let y = NICHE.y0; y <= NICHE.y1; y++) b.del(x, y, face);
        }
        box(nx0, nx1, NICHE.y0, NICHE.y1, behind, behind, LANTERN);
      }

      // The beacon standing on the cornice: a dark base, a burning glass and a
      // cowl, which is the same three courses the tennis floodlights are made of.
      const [bx0, bx1] = [
        Math.min(at(BEACON.x0), at(BEACON.x1)),
        Math.max(at(BEACON.x0), at(BEACON.x1)),
      ];
      box(bx0, bx1, CAP + 1, CAP + 1, BEACON.z0, BEACON.z1, metal.deep);
      box(bx0 + 1, bx1 - 1, CAP + 2, CAP + 3, BEACON.z0 + 1, BEACON.z1 - 1, LANTERN);
      box(bx0, bx1, CAP + 4, CAP + 4, BEACON.z0, BEACON.z1, metal.deep);
    };
    pier(false);
    pier(true);

    // ── the architrave over the carriageway ──────────────────────────────────

    // The frieze, set back a voxel off the piers on both faces, on a base
    // course that gives the whole entablature a line to start from.
    box(SHAFT.x0, mirror(SHAFT.x0), BEAM, BEAM, SHAFT.z0, SHAFT.z1, stone.shade);
    box(SHAFT.x0, mirror(SHAFT.x0), BEAM + 1, CORNICE - 1, FRIEZE.z0, FRIEZE.z1, stone.base);
    // The cornice over it, oversailing everything, and a flat cap on top.
    box(FOOT.x0, mirror(FOOT.x0), CORNICE, CAP - 1, FOOT.z0 + 1, FOOT.z1 - 1, stone.light);
    box(SHAFT.x0, mirror(SHAFT.x0), CAP, CAP, SHAFT.z0, SHAFT.z1, stone.shade);

    /**
     * The nameplate, blank, on both faces: a timber frame with the panel set a
     * voxel back into the stone behind it.
     *
     * Recessed rather than laid on, for the reason the niches are. A panel
     * painted flat onto a wall is a coloured rectangle; a panel with a frame
     * round it and a voxel of shadow behind it is a sign.
     */
    for (const [face, behind] of [
      [FRIEZE.z1, FRIEZE.z1 - 1],
      [FRIEZE.z0, FRIEZE.z0 + 1],
    ] as const) {
      box(18, mirror(18), BEAM + 1, CORNICE - 1, face, face, teak.shade);
      for (let x = 20; x <= mirror(20); x++) {
        for (let y = BEAM + 2; y <= CORNICE - 2; y++) b.del(x, y, face);
      }
      box(20, mirror(20), BEAM + 2, CORNICE - 2, behind, behind, stucco.light);
    }

    /**
     * The two leaves, open.
     *
     * Each is a hinge stile, three bars and a leading stile, with a bottom rail,
     * a mid rail and a heavier top rail over them, folded back flat against the
     * inner face of its pier. Bars of single voxels are the shape this grid is
     * worst at and normally the thing to build solid instead — but a wrought-iron
     * gate is bars, each one is a 1x15 column that merges into four quads, and a
     * leaf drawn as a panel would be a wall standing in the carriageway.
     */
    const leaf = (flip: boolean): void => {
      // Hard against the pier's inner face, which is the one voxel of the
      // carriageway a folded-back leaf takes up. The pier shaft ends at
      // `SHAFT.x1`, so the leaf is the two columns outboard of the road.
      const x0 = flip ? mirror(ROAD.x0 - 1) - 1 : ROAD.x0 - 2;
      const x1 = x0 + 1;
      const top = GROUND + LEAF.height;
      for (const z of LEAF.bars) box(x0, x1, GROUND, top - 2, z, z, metal.deep);
      box(x0, x1, GROUND, top - 2, LEAF.z1, LEAF.z1, metal.deep); // leading stile
      for (const y of [GROUND, GROUND + 7]) box(x0, x1, y, y, LEAF.z0, LEAF.z1, metal.deep);
      box(x0, x1, top - 1, top, LEAF.z0, LEAF.z1, metal.shade); // top rail
      for (const z of LEAF.bars) box(x0, x1, top + 1, top + 1, z, z, metal.shade); // finials
    };
    leaf(false);
    leaf(true);

    // Planting at the entrance, which is the one high-frequency detail the lane
    // allows and the one place it asks for it: a pot in each inner corner of the
    // carriageway, on both faces, so the gate is dressed from either approach.
    for (const x of [ROAD.x0, mirror(ROAD.x0) - 2]) {
      for (const z of [0, NZ - 2]) pottedPlant(b, { x, z, y: GROUND, size: 3 });
    }
  },
});
