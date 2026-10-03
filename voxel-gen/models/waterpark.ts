import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import {
  defineModel,
  type ModelLoop,
  type ModelLoopPoint,
  type VoxelBuilder,
} from '../voxelgen.ts';

const X = 95;
const Z = 95;

const DECK = 3;
const TOP = 4;

const TOWER_Z = 6;
const TOWER_D = 18;
const TOWER_FRONT = TOWER_Z + TOWER_D;

// The blue flume is glass, not water: a declared water colour is water everywhere in the
// model, so it would be meshed with the basin and ripple in mid-air.
const SECTIONS = [
  { x: 18, storeys: 1, flume: PALETTE.amber },
  { x: 34, storeys: 2, flume: PALETTE.bloom },
  { x: 50, storeys: 3, flume: PALETTE.glass },
] as const;

const SECTION_W = 16;

const CHUTE_INSET = 5;
const CHUTE_W = 6;

const CHUTE_END = 64;

const BASIN = { x: 12, z: 54, w: 56, d: 31 } as const;

// East and straight: the flight has to clear the basin, and a 9.5 m climb at one rise to
// two of going needs 76 voxels of run on a 96-voxel plot.
const STAIR = { x: 72, w: 6, head: 10, top: TOP + 37 } as const;

const LANDING = { z0: TOWER_Z, z1: 11 } as const;

const FLIGHT_LANDING = 3;

const LOUNGERS = [
  [8, 86],
  [24, 86],
  [40, 86],
  [56, 86],
  [4, 30],
  [4, 48],
  [4, 66],
] as const;

const LIE_ON = { x: 2, y: TOP + 2, z: 6 } as const;

const PARASOLS = [
  [18, 90],
  [50, 90],
  [6, 40],
] as const;

const FLOOD = 0x7fd8ee;

// Where each section's roof is walked, and where its flight of steps lands.
const platformOf = (storeys: number): number => TOP + storeys * 12 + 1;

// The loops ride the same curve the flumes are built on.
const flumeFloor = (from: number, z: number): number => {
  const t = (z - TOWER_FRONT) / (CHUTE_END - TOWER_FRONT);
  return Math.round(from - (from - TOP) * (2 * t - t * t));
};

// The first free layer over the bed: where the flume drops, its bed is filled up to one under
// the step before.
const flumeSeat = (from: number, z: number): number =>
  Math.max(flumeFloor(from, z) + 1, z > TOWER_FRONT ? flumeFloor(from, z - 1) : from);

// Inside the coping and south of where the flumes come down, so nobody swims under one.
const SWIM = {
  x: BASIN.x + 2,
  z: CHUTE_END + 2,
  w: BASIN.w - 4,
  d: BASIN.z + BASIN.d - CHUTE_END - 4,
} as const;

// The middle of the stair and of the flights' treads, a column clear of their rails.
const STAIR_MIDDLE = STAIR.x + 2;
const FLIGHT_Z = TOWER_Z + 2;
const TREADS = [0, 6, 12, 18, 24, 30, 37] as const;
const FLUME_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40] as const;
// Out over the east coping, where no lounger stands, and round to the foot of the stair.
const EAST_EXIT = { swim: BASIN.x + BASIN.w - 3, deck: BASIN.x + BASIN.w + 1, z: 72 } as const;
const STAIR_FOOT = STAIR.head + (STAIR.top - TOP) * 2 + 2;

type Point = ModelLoopPoint;

function upTheStair(): Point[] {
  const rise = STAIR.top - TOP;
  return TREADS.map((tread) => ({
    x: STAIR_MIDDLE,
    y: TOP + tread + 1,
    z: STAIR.head + (rise - tread) * 2 + 1,
    pose: 'walk',
  }));
}

// From the gangway down the flights to the section's own roof, then to the mouth of its flume.
function acrossTheRoofs(section: number): Point[] {
  const top = SECTIONS[SECTIONS.length - 1]!;
  const points: Point[] = [
    { x: top.x + SECTION_W - 1, y: platformOf(top.storeys) + 1, z: FLIGHT_Z, pose: 'walk' },
  ];
  for (let step = SECTIONS.length - 2; step >= section; step--) {
    const lower = SECTIONS[step]!;
    const upper = SECTIONS[step + 1]!;
    const low = platformOf(lower.storeys) + 1;
    const high = platformOf(upper.storeys) + 1;
    const foot = lower.x + FLIGHT_LANDING;
    points.push(
      { x: upper.x - 1, y: high, z: FLIGHT_Z, pose: 'walk' },
      { x: (foot + upper.x - 1) / 2, y: (low + high) / 2, z: FLIGHT_Z, pose: 'walk' },
      { x: foot, y: low, z: FLIGHT_Z, pose: 'walk' },
    );
  }
  const { x, storeys } = SECTIONS[section]!;
  const feet = platformOf(storeys) + 1;
  const flume = x + CHUTE_INSET + CHUTE_W / 2;
  const aside = section === SECTIONS.length - 1 ? x + SECTION_W - 2 : x + 2;
  points.push(
    { x: aside, y: feet, z: FLIGHT_Z, pose: 'walk' },
    { x: aside, y: feet, z: TOWER_FRONT - 3, pose: 'walk' },
    { x: flume, y: feet, z: TOWER_FRONT - 2, pose: 'slide' },
  );
  return points;
}

function downTheFlume(section: number): Point[] {
  const { x, storeys } = SECTIONS[section]!;
  const flume = x + CHUTE_INSET + CHUTE_W / 2;
  return FLUME_STEPS.map((step) => ({
    x: flume,
    y: flumeSeat(platformOf(storeys), TOWER_FRONT + step),
    z: TOWER_FRONT + step,
    pose: 'slide',
  }));
}

function backToTheStair(section: number): Point[] {
  const { x } = SECTIONS[section]!;
  const flume = x + CHUTE_INSET + CHUTE_W / 2;
  const legs = Math.ceil((EAST_EXIT.swim - flume) / 15);
  const swim: Point[] = Array.from({ length: legs }, (_, leg) => ({
    x: Math.round(flume + ((EAST_EXIT.swim - flume) * leg) / legs),
    y: DECK,
    z: Math.round(CHUTE_END + 2 + ((EAST_EXIT.z - CHUTE_END - 2) * leg) / legs),
    pose: 'swim',
  }));
  return [
    ...swim,
    { x: EAST_EXIT.swim, y: DECK, z: EAST_EXIT.z, pose: 'climb' },
    { x: EAST_EXIT.swim + 1, y: TOP + 1, z: EAST_EXIT.z, pose: 'walk' },
    { x: EAST_EXIT.deck, y: TOP, z: EAST_EXIT.z, pose: 'walk' },
    { x: EAST_EXIT.deck + 1, y: TOP, z: STAIR_FOOT, pose: 'walk' },
    { x: STAIR_MIDDLE, y: TOP, z: STAIR_FOOT + 1, pose: 'walk' },
  ];
}

const rideFor = (section: number): ModelLoop => ({
  places: 3,
  points: [
    ...upTheStair(),
    ...acrossTheRoofs(section),
    ...downTheFlume(section),
    ...backToTheStair(section),
  ],
});

export default defineModel({
  id: 'waterpark',
  label: 'Waterpark',
  category: 'leisure',
  tiles: { x: 6, z: 6 },
  // Mostly water, which the size rule reads as cheap.
  cost: 8_000,
  seats: LOUNGERS.map(
    ([x, z]) =>
      ({ x: x + LIE_ON.x, y: LIE_ON.y, z: z + LIE_ON.z, facing: 0, pose: 'lie' }) as const,
  ),
  water: [PALETTE.water.base],
  windows: WINDOW_GLASS,
  lights: [
    { x: 24, y: 3, z: 70, color: FLOOD, intensity: 120, distance: 66 },
    { x: 40, y: 3, z: 70, color: FLOOD, intensity: 120, distance: 66 },
    { x: 56, y: 3, z: 70, color: FLOOD, intensity: 120, distance: 66 },
    { x: 40, y: 3, z: 18, color: FLOOD, intensity: 90, distance: 52 },
  ],
  venue: {
    shelter: 'open',
    role: 'activity',
    sign: 'waterpark',
    names: [
      'Splash Lagoon',
      'The Big Wet',
      'Aqua Mare',
      'Wave Valley',
      'Slide City',
      'The Whirlpool',
      'Torrent Bay',
      'Acquapark Sole',
      'The Splash Zone',
      'Lagoon Loco',
      'Hydro Hills',
      'The Great Plunge',
    ],
    bathing: true,
    satisfies: [
      { need: 'fun', amount: 1 },
      { need: 'energy', amount: -0.3 },
    ],
    capacity: 40,
    dwellSeconds: { min: 3600, max: 10_800 },
    reliability: 60,
    order: ['areas', 'loops', 'seats'],
    areas: [{ kind: 'swim', ...SWIM, surface: DECK, places: 10 }],
    loops: SECTIONS.map((_, section) => rideFor(section)),
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, foliage, stone, stucco, teak } = PALETTE;

    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });

    const surface = poolWater(b, { ...BASIN, deck: DECK, depth: 2 });

    // Curved only in section, one voxel per column of z, so the bed still merges down its length.
    const flume = (x0: number, from: number, paint: Ramp): void => {
      const bed0 = x0 + 1;
      const bed1 = x0 + CHUTE_W - 2;
      const run = CHUTE_END - TOWER_FRONT;
      let last = from;
      for (let step = 0; step <= run; step++) {
        const z = TOWER_FRONT + step;
        const y = flumeFloor(from, z);
        box(bed0, bed1, y, y, z, z, paint.base);
        box(x0, x0, y, y + 1, z, z, paint.shade);
        box(x0 + CHUTE_W - 1, x0 + CHUTE_W - 1, y, y + 1, z, z, paint.shade);
        if (y < last) box(bed0, bed1, y, last - 1, z, z, paint.shade);
        last = y;
      }
      for (const z of [TOWER_FRONT + 6, TOWER_FRONT + 16, TOWER_FRONT + 26]) {
        const y = flumeFloor(from, z);
        for (const post of [x0, x0 + CHUTE_W - 2])
          box(post, post + 1, TOP, y - 1, z, z + 1, teak.base);
      }
    };

    for (const section of SECTIONS) {
      const x1 = section.x + SECTION_W - 1;
      const platform = stuccoWall(b, {
        x: section.x,
        z: TOWER_Z,
        w: SECTION_W,
        d: TOWER_D,
        y: TOP,
        storeys: section.storeys,
      });
      if (platform !== platformOf(section.storeys))
        throw new Error('The riders and roofs disagree');
      box(section.x, x1, platform, platform, TOWER_Z, TOWER_Z + TOWER_D - 1, teak.light);

      const rail = { y: platform + 1, height: 4, pitch: 3, rail: teak } as const;
      balustrade(b, { ...rail, x: section.x, z: TOWER_Z, w: SECTION_W, along: 'x' });
      const chute = section.x + CHUTE_INSET;
      balustrade(b, {
        ...rail,
        x: section.x,
        z: TOWER_FRONT - 1,
        w: CHUTE_INSET,
        along: 'x',
      });
      balustrade(b, {
        ...rail,
        x: chute + CHUTE_W,
        z: TOWER_FRONT - 1,
        w: x1 - (chute + CHUTE_W) + 1,
        along: 'x',
      });
      if (section.x === SECTIONS[0]!.x)
        balustrade(b, { ...rail, x: section.x, z: TOWER_Z, w: TOWER_D, along: 'z' });
      if (section.x === SECTIONS[SECTIONS.length - 1]!.x) {
        // The rail stops short of the east edge, where the gangway arrives.
        balustrade(b, {
          ...rail,
          x: x1,
          z: LANDING.z1 + 1,
          w: TOWER_Z + TOWER_D - LANDING.z1 - 1,
          along: 'z',
        });
      }

      for (const along of [section.x + 2, x1 - 4]) {
        shutteredWindow(b, { face: 'z+', at: TOWER_FRONT - 1, along, y: TOP + 4 });
      }

      flume(chute, platform, section.flume);
    }

    const flight = (x0: number, x1: number, low: number, high: number): void => {
      const z0 = TOWER_Z + 1;
      const z1 = z0 + 3;
      const span = x1 - x0;
      for (let x = x0; x <= x1; x++) {
        const y = low + Math.round(((high - low) * (x - x0)) / span);
        box(x, x, low, y - 1, z0, z1, stone.base);
        box(x, x, y, y, z0, z1, stone.light);
        // Railed on both sides: open air to the north and a twelve-voxel drop to the south.
        for (const side of [z0, z1]) {
          box(x, x, y + 3, y + 3, side, side, teak.base);
          if ((x - x0) % 4 === 0) box(x, x, y + 1, y + 2, side, side, teak.base);
        }
      }
    };
    for (let step = 0; step < SECTIONS.length - 1; step++) {
      const lower = SECTIONS[step]!;
      const upper = SECTIONS[step + 1]!;
      flight(
        lower.x + FLIGHT_LANDING,
        upper.x - 1,
        platformOf(lower.storeys),
        platformOf(upper.storeys),
      );
    }

    const cap = { x: 53, z: 9, w: 10, d: 10 } as const;
    const capTop = stuccoWall(b, { ...cap, y: TOP + 36 + 1, storeys: 1, quoins: false });
    hipRoof(b, { ...cap, y: capTop, overhang: 2 });

    const rise = STAIR.top - TOP;
    for (let tread = 0; tread <= rise; tread++) {
      const y = TOP + tread;
      const z = STAIR.head + (rise - tread) * 2;
      box(STAIR.x, STAIR.x + STAIR.w - 1, y, y, z, z + 1, stone.base);
      for (const side of [STAIR.x, STAIR.x + STAIR.w - 1]) {
        box(side, side, y - 1, y - 1, z, z + 1, stone.shade);
        box(side, side, y + 4, y + 4, z, z + 1, teak.base);
        if (tread % 3 === 0) box(side, side, y + 1, y + 3, z, z, teak.base);
        if (tread % 6 === 0 && tread > 0) box(side, side, TOP, y - 2, z, z, teak.base);
      }
    }
    const gangway = SECTIONS[SECTIONS.length - 1]!.x + SECTION_W;
    box(STAIR.x, STAIR.x + STAIR.w - 1, STAIR.top, STAIR.top, LANDING.z0, LANDING.z1, stone.base);
    box(gangway, STAIR.x - 1, STAIR.top, STAIR.top, LANDING.z0, LANDING.z1, teak.light);
    const head = { y: STAIR.top + 1, height: 4, pitch: 3, rail: teak } as const;
    balustrade(b, {
      ...head,
      x: gangway,
      z: LANDING.z0,
      w: STAIR.x + STAIR.w - gangway,
      along: 'x',
    });
    balustrade(b, {
      ...head,
      x: STAIR.x + STAIR.w - 1,
      z: LANDING.z0,
      w: LANDING.z1 - LANDING.z0 + 1,
      along: 'z',
    });
    balustrade(b, { ...head, x: gangway, z: LANDING.z1, w: STAIR.x - gangway, along: 'x' });

    const lounger = (x: number, z: number): void => {
      box(x, x + 4, TOP, TOP, z, z + 9, teak.shade);
      box(x, x + 4, TOP + 1, TOP + 1, z + 3, z + 9, stucco.light);
      box(x, x + 4, TOP + 1, TOP + 2, z + 1, z + 2, stucco.light);
      box(x, x + 4, TOP + 3, TOP + 3, z, z + 1, stucco.light);
      box(x + 1, x + 3, TOP + 2, TOP + 2, z + 8, z + 9, amber.base);
    };
    for (const [x, z] of LOUNGERS) lounger(x, z);
    for (const [x, z] of PARASOLS) parasol(b, { x, z, y: TOP, reach: 3 });

    // On the south rim: the three flumes come down on the north one.
    const rim = BASIN.z + BASIN.d;
    for (const x of [22, 54]) {
      for (const rail of [x, x + 3]) {
        box(rail, rail, TOP, TOP + 3, rim, rim, PALETTE.metal.base);
        box(rail, rail, TOP + 3, TOP + 3, rim - 1, rim - 1, PALETTE.metal.base);
      }
      for (const rung of [TOP, TOP + 2])
        box(x + 1, x + 2, rung, rung, rim, rim, PALETTE.metal.base);
    }

    for (const x of [1, X - 2]) {
      for (const z of [1, Z - 2]) pottedPlant(b, { x, z, y: TOP });
    }
    for (const z of [TOWER_FRONT + 6, TOWER_FRONT + 26]) {
      flowerBox(b, { x: 82, z, y: TOP, w: 12, along: 'z', blooms: [foliage.base] });
      flowerBox(b, { x: X - 3, z, y: TOP, w: 12, along: 'z', blooms: [foliage.base] });
    }

    box(BASIN.x, BASIN.x + BASIN.w - 1, surface, surface, BASIN.z, BASIN.z, stone.light);
  },
});
