/**
 * Adventure golf: sixteen kerbed lanes in four quarters on one stone plinth,
 * sand walks round and through the course, a clipped hedge on the boundary, and
 * a landmark in every quarter — a windmill over one lane, a lighthouse, a rock
 * garden and a putter kiosk. 144x112 (36 x 28 m), a 9x7 tile.
 *
 * Massing from `docs/references/minigolf.jpg`, colour from the Mediterranean
 * lane as everything is. See `docs/art-direction.md`.
 *
 * **Why it grew from 6x5 to 9x7.** The course it replaces was ten 3x7 m beds on
 * 480 m² — less ground than the tennis enclosure, where a real adventure golf
 * course takes 1 000 m² and more. It also drew its holes as beds rather than as
 * lanes: a green three metres wide reads as a lawn, not as something a ball is
 * putted along. A lane here is seven voxels across kerb to kerb, 1.75 m, and six
 * to eleven metres long, which is what real ones measure.
 *
 * **One quarter, drawn four times.** Each quarter is 60x44 voxels between the
 * walks and holds the same four lanes — a long straight one, an L, a long one
 * across the bottom and a wide feature lane across the top — with what stands
 * on them varied. The repetition is what keeps sixteen holes legible from the
 * height the resort is seen at, and a quarter's empty corner is where its
 * landmark goes.
 *
 * **Lanes are unions of rectangles.** Every cell of a lane is felt, and every
 * cell with a neighbour outside the lane carries a course of kerb. An L is then
 * two rectangles and no special case, and every surface is one flat colour, so
 * the mesher merges the felt of a lane into a handful of quads.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { awning, shutteredWindow, stuccoWall } from '../parts/wall.ts';
import { pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 143;
const Z = 111;

/** The layer the course is played on: the plinth's first free layer. */
const GREEN = 3;

/** The lawn, inset a voxel inside the plinth so its stone edge reads as a kerb. */
const LAWN = { x0: 2, x1: 141, z0: 2, z1: 109 } as const;

/** The walks: a ring inside the verge, and a cross through the middle. */
const WALK = 4;
const RING = { x0: 6, x1: 137, z0: 6, z1: 105 } as const;
const CROSS = { x: 70, z: 54 } as const;

/** The north-west corner of each quarter, and how big one is. */
const QUARTERS = [
  [10, 10],
  [74, 10],
  [10, 58],
  [74, 58],
] as const;

/** What stands in the middle of a lane, between its tee and its cup. */
type Obstacle = 'bank' | 'mound' | 'hedge' | 'pond' | 'windmill' | 'none';

/** What fills the corner of a quarter its four lanes leave free. */
type Landmark = 'rocks' | 'lighthouse' | 'kiosk' | 'fountain';

interface Rect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}

interface Lane {
  /** Kerb included; relative to the quarter. */
  readonly rects: readonly Rect[];
  readonly tee: readonly [number, number];
  readonly cup: readonly [number, number];
  /** The rectangle the obstacle is centred in, and the way the ball runs along it. */
  readonly middle: Rect;
  readonly along: 'x' | 'z';
}

/** The four lanes of a quarter, in the order they are played. */
const LANES: readonly Lane[] = [
  {
    rects: [{ x: 2, z: 2, w: 7, d: 40 }],
    tee: [5, 4],
    cup: [5, 39],
    middle: { x: 2, z: 2, w: 7, d: 40 },
    along: 'z',
  },
  {
    rects: [
      { x: 13, z: 2, w: 7, d: 26 },
      { x: 13, z: 22, w: 26, d: 7 },
    ],
    tee: [16, 4],
    cup: [35, 25],
    middle: { x: 13, z: 2, w: 7, d: 20 },
    along: 'z',
  },
  {
    rects: [{ x: 13, z: 35, w: 45, d: 7 }],
    tee: [15, 38],
    cup: [55, 38],
    middle: { x: 13, z: 35, w: 45, d: 7 },
    along: 'x',
  },
  {
    rects: [{ x: 24, z: 2, w: 34, d: 12 }],
    tee: [26, 7],
    cup: [55, 7],
    middle: { x: 24, z: 2, w: 34, d: 12 },
    along: 'x',
  },
];

/** The four neighbours a lane cell is checked against for its kerb. */
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The interior of a rectangle: the cells inside its kerb. */
const inner = (r: Rect): Rect => ({ x: r.x + 1, z: r.z + 1, w: r.w - 2, d: r.d - 2 });

/** The corner a quarter's landmark stands in, relative to the quarter. */
const CORNER = { x: 40, z: 16, w: 18, d: 17 } as const;

/** What each quarter puts on its four lanes, and in its corner. */
const DRESSING: ReadonlyArray<{
  readonly obstacles: readonly [Obstacle, Obstacle, Obstacle, Obstacle];
  readonly landmark: Landmark;
}> = [
  { obstacles: ['bank', 'mound', 'hedge', 'windmill'], landmark: 'rocks' },
  { obstacles: ['mound', 'hedge', 'bank', 'pond'], landmark: 'lighthouse' },
  { obstacles: ['hedge', 'bank', 'mound', 'none'], landmark: 'kiosk' },
  { obstacles: ['bank', 'mound', 'hedge', 'pond'], landmark: 'fountain' },
];

/**
 * The one colour that burns after dark: `amber.light`, the lantern the bars and
 * the taverna hang, rather than a yellow private to this model.
 */
const LANTERN = PALETTE.amber.light;

/**
 * Eight knee-high bollards on the edges of the cross walks, alternating sides.
 *
 * Eight rather than more: a lamp is bake time rather than frame time, but the
 * course stands on the plot several times, and a course lit by floods is a car
 * park. The lighthouse and the kiosk carry the other two lights.
 */
const BOLLARDS: ReadonlyArray<readonly [number, number]> = [
  [20, CROSS.z],
  [44, CROSS.z + WALK - 1],
  [98, CROSS.z],
  [122, CROSS.z + WALK - 1],
  [CROSS.x, 20],
  [CROSS.x + WALK - 1, 44],
  [CROSS.x, 68],
  [CROSS.x + WALK - 1, 92],
];

/** The lighthouse's lamp room, and the kiosk's hatch lantern, in plot coordinates. */
const BEACON = { x: 122, z: 34, y: GREEN + 33 } as const;
const KIOSK = { x: 52, z: 76, w: 14, d: 12 } as const;

export default defineModel({
  id: 'minigolf',
  label: 'Minigolf',
  category: 'leisure',
  placement: { perResort: { min: 1, max: 3 } },
  venue: {
    // sixteen lanes on an open plinth.
    shelter: 'open',
    role: 'activity',
    satisfies: [{ need: 'fun', amount: 0.7 }],
    capacity: 16,
    dwellSeconds: { min: 1800, max: 3600 },
    doors: [
      { x: CROSS.x + 1, z: 0, facing: 2 },
      { x: CROSS.x + 1, z: Z, facing: 0 },
      { x: 0, z: CROSS.z + 1, facing: 3 },
      { x: X, z: CROSS.z + 1, facing: 1 },
    ],
  },
  tiles: { x: 9, z: 7 },
  emissive: [LANTERN],
  // The ponds and the fountain basin, meshed apart and shaded as the sea is.
  water: [PALETTE.water.base],
  lights: [
    ...BOLLARDS.map(([x, z]) => ({
      x,
      z,
      y: GREEN + 4,
      color: LANTERN,
      intensity: 34,
      distance: 28,
    })),
    { x: BEACON.x, y: BEACON.y, z: BEACON.z, color: LANTERN, intensity: 60, distance: 40 },
    {
      x: KIOSK.x + KIOSK.w + 1,
      y: GREEN + 9,
      z: KIOSK.z + 6,
      color: LANTERN,
      intensity: 50,
      distance: 32,
    },
  ],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { bloom, foliage, glass, grass, metal, sand, stone, stucco, teak, terracotta, water } =
      PALETTE;

    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    box(LAWN.x0, LAWN.x1, GREEN, GREEN, LAWN.z0, LAWN.z1, grass.base);

    // The walks: the ring, the cross, and the four gates where the cross runs
    // out through the verge to the plinth's edge.
    const walk = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, GREEN, GREEN, z0, z1, sand.base);
    walk(RING.x0, RING.x1, RING.z0, RING.z0 + WALK - 1);
    walk(RING.x0, RING.x1, RING.z1 - WALK + 1, RING.z1);
    walk(RING.x0, RING.x0 + WALK - 1, RING.z0, RING.z1);
    walk(RING.x1 - WALK + 1, RING.x1, RING.z0, RING.z1);
    walk(CROSS.x, CROSS.x + WALK - 1, LAWN.z0, LAWN.z1);
    walk(LAWN.x0, LAWN.x1, CROSS.z, CROSS.z + WALK - 1);

    /** A clipped block of hedge: the boundary and an obstacle both. */
    const clipped = (x0: number, x1: number, z0: number, z1: number, height = 3): void =>
      box(x0, x1, GREEN + 1, GREEN + height, z0, z1, foliage.base);

    /** A lane: felt on every cell, a course of kerb on every cell at its edge. */
    const lane = (rects: readonly Rect[]): void => {
      const cells = new Set<string>();
      for (const r of rects) {
        for (let x = r.x; x < r.x + r.w; x++) {
          for (let z = r.z; z < r.z + r.d; z++) cells.add(`${x},${z}`);
        }
      }
      for (const cell of cells) {
        const [x, z] = cell.split(',').map(Number) as [number, number];
        set(x, GREEN, z, grass.light);
        const edge = SIDES.some(([dx, dz]) => !cells.has(`${x + dx},${z + dz}`));
        if (edge) set(x, GREEN + 1, z, stone.light);
      }
    };

    /**
     * The cup, its ring of paving, and a flag in it. A real course has no
     * flags; this one does, because from 30 m up a flag is what says where a
     * lane ends. They alternate red and yellow so neighbouring lanes part.
     */
    const cup = (x: number, z: number, flag: number): void => {
      box(x - 1, x + 1, GREEN, GREEN, z - 1, z + 1, stone.light);
      set(x, GREEN, z, metal.deep);
      box(x, x, GREEN + 1, GREEN + 6, z, z, stucco.light);
      box(x + 1, x + 3, GREEN + 5, GREEN + 6, z, z, flag);
    };

    /**
     * Lays a box across a lane at its middle, in the lane's own frame: `from`
     * and `to` run across the lane, `length` runs along it.
     */
    const across = (
      r: Rect,
      along: 'x' | 'z',
      from: number,
      to: number,
      length: number,
      y0: number,
      y1: number,
      color: number,
    ): void => {
      const mid = along === 'z' ? r.z + Math.floor(r.d / 2) : r.x + Math.floor(r.w / 2);
      const lo = mid - Math.floor(length / 2);
      const hi = lo + length - 1;
      if (along === 'z') box(r.x + from, r.x + to, y0, y1, lo, hi, color);
      else box(lo, hi, y0, y1, r.z + from, r.z + to, color);
    };

    /** A low stone wall across the lane with a gap in its middle to putt through. */
    const bank = (r: Rect, along: 'x' | 'z'): void => {
      const width = along === 'z' ? r.w : r.d;
      const gap = width > 6 ? 2 : 1;
      const left = Math.floor((width - gap) / 2);
      across(r, along, 0, left - 1, 2, GREEN + 1, GREEN + 2, stone.base);
      across(r, along, left + gap, width - 1, 2, GREEN + 1, GREEN + 2, stone.base);
    };

    /** Two grass terraces the ball has to be putted up and over. */
    const mound = (r: Rect, along: 'x' | 'z'): void => {
      const width = along === 'z' ? r.w : r.d;
      across(r, along, 0, width - 1, 10, GREEN + 1, GREEN + 1, grass.base);
      across(r, along, 1, width - 2, 6, GREEN + 2, GREEN + 2, grass.light);
    };

    /** A dogleg: two blocks of hedge standing off opposite kerbs. */
    const hedge = (r: Rect, along: 'x' | 'z'): void => {
      const width = along === 'z' ? r.w : r.d;
      const reach = Math.ceil(width * 0.6) - 1;
      const shift = (rect: Rect, by: number): Rect =>
        along === 'z' ? { ...rect, z: rect.z + by } : { ...rect, x: rect.x + by };
      const colour = foliage.base;
      across(shift(r, -4), along, 0, reach, 3, GREEN + 1, GREEN + 3, colour);
      across(shift(r, 4), along, width - 1 - reach, width - 1, 3, GREEN + 1, GREEN + 3, colour);
    };

    /** A pond right across the lane, cut with `poolWater`, and a plank over it. */
    const pond = (r: Rect, along: 'x' | 'z'): void => {
      const length = 10;
      const mid = along === 'z' ? r.z + Math.floor(r.d / 2) : r.x + Math.floor(r.w / 2);
      const lo = mid - length / 2;
      const basin =
        along === 'z'
          ? { x: r.x - 1, z: lo, w: r.w + 2, d: length }
          : { x: lo, z: r.z - 1, w: length, d: r.d + 2 };
      poolWater(b, { ...basin, deck: GREEN, depth: 1, water });
      const width = along === 'z' ? r.w : r.d;
      const plankFrom = Math.floor(width / 2) - 1;
      across(r, along, plankFrom, plankFrom + 1, length, GREEN, GREEN, teak.base);
      across(r, along, plankFrom, plankFrom + 1, 1, GREEN + 1, GREEN + 1, teak.shade);
    };

    /**
     * The windmill over a feature lane: a rendered tower with a tunnel through
     * its foot along the lane, a tiled hip over it and four sails on the side the
     * camera is on. 3 m square and 6 m to the eaves, which is the size a course
     * builds one — the model it replaces stood a 2 m tower on a 3 m green.
     */
    const windmill = (r: Rect): void => {
      const cx = r.x + Math.floor(r.w / 2);
      const x0 = cx - 6;
      const x1 = cx + 5;
      const z0 = r.z - 1;
      const z1 = r.z + r.d;
      const base = GREEN + 1;
      const top = base + 22;

      box(x0, x1, base, top, z0, z1, stucco.base);
      box(x0, x1, base, base + 1, z0, z1, stone.base);
      box(x0, x1, top, top, z0, z1, stucco.light);
      for (const face of ['x-', 'x+'] as const) {
        shutteredWindow(b, {
          face,
          at: face === 'x-' ? x0 : x1,
          along: z0 + 4,
          y: base + 12,
          w: 3,
        });
      }

      // The tunnel the ball runs through, carved along the lane and framed in
      // stone at both ends.
      const lo = r.z + 3;
      const hi = r.z + r.d - 4;
      for (let x = x0; x <= x1; x++) {
        for (let y = base; y <= base + 3; y++) {
          for (let z = lo; z <= hi; z++) b.del(x, y, z);
        }
      }
      for (const face of [x0, x1]) {
        box(face, face, base + 4, base + 4, lo - 1, hi + 1, stone.light);
        box(face, face, base, base + 4, lo - 1, lo - 1, stone.light);
        box(face, face, base, base + 4, hi + 1, hi + 1, stone.light);
      }
      // Felt through the tunnel, so the lane carries on under the tower.
      box(x0, x1, GREEN, GREEN, lo, hi, grass.light);

      hipRoof(b, { x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1, y: top + 1, overhang: 1 });

      // The sails: a hub, four arms and two courses of canvas off each arm on the
      // same side of it, so the wheel reads as turning one way.
      const hx = cx;
      const hy = base + 14;
      const hz = z1 + 1;
      box(hx - 1, hx + 1, hy - 1, hy + 1, hz, hz, teak.shade);
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ] as const) {
        for (let arm = 1; arm <= 9; arm++) {
          set(hx + dx * arm, hy + dy * arm, hz, teak.shade);
          if (arm < 3) continue;
          for (const vane of [1, 2, 3])
            set(hx + dx * arm - dy * vane, hy + dy * arm + dx * vane, hz, stucco.light);
        }
      }
    };

    const OBSTACLES: Record<Exclude<Obstacle, 'windmill' | 'none'>, typeof bank> = {
      bank,
      mound,
      hedge,
      pond,
    };

    /** A rock garden: three stepped courses of stone with a pond at their foot. */
    const rocks = (cx: number, cz: number): void => {
      box(cx, cx + 13, GREEN + 1, GREEN + 3, cz + 1, cz + 11, stone.shade);
      box(cx + 2, cx + 11, GREEN + 4, GREEN + 6, cz + 3, cz + 9, stone.base);
      box(cx + 4, cx + 8, GREEN + 7, GREEN + 9, cz + 4, cz + 7, stone.shade);
      poolWater(b, { x: cx + 1, z: cz + 13, w: 16, d: 3, deck: GREEN, depth: 1, water });
      for (const [px, pz] of [
        [cx + 15, cz + 2],
        [cx + 15, cz + 8],
      ] as const)
        pottedPlant(b, { x: px, z: pz, y: GREEN });
    };

    /**
     * A lighthouse: a banded tower on a rock, a gallery, and a lamp room that
     * burns after dark. The tall thing a course is recognised by from across
     * the resort, and at 9 m the one silhouette on the plot above the windmill.
     */
    const lighthouse = (cx: number, cz: number): void => {
      box(cx - 6, cx + 5, GREEN + 1, GREEN + 2, cz - 6, cz + 5, stone.shade);
      const foot = GREEN + 3;
      const head = foot + 26;
      box(cx - 4, cx + 3, foot, head, cz - 4, cz + 3, stucco.light);
      for (const band of [foot + 6, foot + 14, foot + 22]) {
        box(cx - 4, cx + 3, band, band + 2, cz - 4, cz + 3, bloom.base);
      }
      shutteredWindow(b, { face: 'z+', at: cz + 3, along: cx - 1, y: foot + 9, w: 2, h: 3 });
      box(cx - 5, cx + 4, head + 1, head + 1, cz - 5, cz + 4, stone.light);
      box(cx - 2, cx + 1, head + 2, head + 4, cz - 2, cz + 1, glass.base);
      box(cx - 1, cx, head + 2, head + 4, cz - 1, cz, LANTERN);
      box(cx - 3, cx + 2, head + 5, head + 5, cz - 3, cz + 2, terracotta.deep);
      box(cx - 1, cx, head + 6, head + 6, cz - 1, cz, terracotta.base);
    };

    /**
     * The putter kiosk: a whitewashed hut under a tiled hip, with a hatch under
     * a blind on the side that faces the cross walk and a rack of putters by
     * its door. It is where the course is entered from, so it stands beside the
     * walk rather than in the middle of a quarter.
     */
    const kiosk = (): void => {
      const eaves = stuccoWall(b, { ...KIOSK, y: GREEN + 1, storeys: 1, skirting: 1 });
      hipRoof(b, { ...KIOSK, y: eaves, overhang: 1 });
      const face = KIOSK.x + KIOSK.w - 1;
      shutteredWindow(b, {
        face: 'x+',
        at: face,
        along: KIOSK.z + 3,
        y: GREEN + 5,
        w: 6,
        h: 4,
        shutters: false,
      });
      box(face + 1, face + 1, GREEN + 4, GREEN + 4, KIOSK.z + 2, KIOSK.z + 9, stone.light);
      awning(b, { face: 'x+', at: face, along: KIOSK.z + 1, w: 10, y: GREEN + 11, reach: 2 });
      for (const z of [KIOSK.z + 1, KIOSK.z + 10]) {
        box(face + 1, face + 1, GREEN + 7, GREEN + 8, z, z, LANTERN);
      }
      // The paving in front of the hatch, run out to the walk.
      box(face + 1, CROSS.x - 1, GREEN, GREEN, KIOSK.z, KIOSK.z + KIOSK.d - 1, stone.base);
      // The rack: three uprights and a rail, and a putter's worth of metal each.
      const rackZ = KIOSK.z + KIOSK.d + 1;
      for (const x of [KIOSK.x + 2, KIOSK.x + 5, KIOSK.x + 8]) {
        box(x, x, GREEN + 1, GREEN + 4, rackZ, rackZ, metal.base);
      }
      box(KIOSK.x + 2, KIOSK.x + 8, GREEN + 4, GREEN + 4, rackZ, rackZ, teak.base);
    };

    /** A round basin with a jet in the middle and planting round it. */
    const fountain = (x: number, z: number): void => {
      poolWater(b, { x, z, w: 16, d: 14, shape: 'round', deck: GREEN, depth: 1, water });
      box(x + 7, x + 8, GREEN - 1, GREEN + 1, z + 6, z + 7, stone.light);
      box(x + 7, x + 8, GREEN + 2, GREEN + 4, z + 6, z + 7, water.light);
      for (const [px, pz] of [
        [x - 1, z - 1],
        [x + 15, z - 1],
        [x - 1, z + 14],
        [x + 15, z + 14],
      ] as const)
        pottedPlant(b, { x: px, z: pz, y: GREEN });
    };

    let hole = 0;
    QUARTERS.forEach(([qx, qz], quarter) => {
      const dressing = DRESSING[quarter]!;
      LANES.forEach((spec, index) => {
        const shift = (r: Rect): Rect => ({ ...r, x: r.x + qx, z: r.z + qz });
        lane(spec.rects.map(shift));
        const [tx, tz] = spec.tee;
        box(qx + tx - 1, qx + tx + 1, GREEN, GREEN, qz + tz - 1, qz + tz + 1, stone.base);
        set(qx + tx, GREEN + 1, qz + tz, teak.deep);
        const obstacle = dressing.obstacles[index]!;
        const middle = shift(spec.middle);
        if (obstacle === 'windmill') windmill(middle);
        else if (obstacle !== 'none') OBSTACLES[obstacle](inner(middle), spec.along);
        cup(qx + spec.cup[0], qz + spec.cup[1], hole % 2 === 0 ? bloom.base : PALETTE.amber.base);
        hole++;
      });
      const cx = qx + CORNER.x;
      const cz = qz + CORNER.z;
      if (dressing.landmark === 'rocks') rocks(cx, cz);
      else if (dressing.landmark === 'lighthouse') lighthouse(BEACON.x, BEACON.z);
      else if (dressing.landmark === 'kiosk') kiosk();
      else fountain(cx, cz);
    });

    /**
     * The boundary hedge: 50 cm thick and a metre tall on the verge, broken at
     * the four gates with a pot either side of each opening. Low on purpose: a
     * course is looked into, and a hedge that hid the lanes would hide the model.
     */
    const stopX = CROSS.x - 3;
    const startX = CROSS.x + WALK + 2;
    const stopZ = CROSS.z - 3;
    const startZ = CROSS.z + WALK + 2;
    for (const z of [LAWN.z0 + 1, LAWN.z1 - 2]) {
      clipped(LAWN.x0 + 1, stopX, z, z + 1, 4);
      clipped(startX, LAWN.x1 - 1, z, z + 1, 4);
      for (const x of [stopX + 1, startX - 2]) pottedPlant(b, { x, z, y: GREEN });
    }
    for (const x of [LAWN.x0 + 1, LAWN.x1 - 2]) {
      clipped(x, x + 1, LAWN.z0 + 1, stopZ, 4);
      clipped(x, x + 1, startZ, LAWN.z1 - 1, 4);
      for (const z of [stopZ + 1, startZ - 2]) pottedPlant(b, { x, z, y: GREEN });
    }

    // The bollards: a stubby post, a burning head and a dark cap over it.
    for (const [x, z] of BOLLARDS) {
      box(x, x, GREEN + 1, GREEN + 3, z, z, metal.deep);
      set(x, GREEN + 4, z, LANTERN);
      set(x, GREEN + 5, z, metal.deep);
    }
  },
});
