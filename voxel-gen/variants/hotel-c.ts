import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { oleander, picnicTable } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { plankRail, SLATS } from '../parts/veranda.ts';
import {
  doorway,
  LOUVRES,
  rubble,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Lit at night, so it is drawn unlit at full brightness.
const LANTERN = PALETTE.amber.light;

const PLOT = { w: 160, d: 80 } as const;
const GROUND = 3;
const STOREYS = 3;

// House C's bay, repeated: stone ends six wide, piers four, loggias thirteen.
const END = 6;
const PIER = 4;
const BAY = 13;
const ROOMS = 31;
const LOGGIA = 8;

interface Wing {
  readonly x: number;
  readonly back: number;
  readonly bays: number;
}

// The far wing steps back as the block in the reference does, which opens a forecourt at the lobby.
const WINGS = [
  { x: 4, back: 13, bays: 4 },
  { x: 80, back: 3, bays: 4 },
] as const satisfies readonly Wing[];

const widthOf = (wing: Wing): number => 2 * END + wing.bays * BAY + (wing.bays - 1) * PIER;
const frontOf = (wing: Wing): number => wing.back + ROOMS;
const bayAt = (wing: Wing, bay: number): number => wing.x + END + bay * (BAY + PIER);

const LOBBY = { x: bayAt(WINGS[1], 0) + 3, w: 6 } as const;
const LOBBY_FRONT = frontOf(WINGS[1]) + LOGGIA;
const LANTERNS = [LOBBY.x - 3, LOBBY.x + LOBBY.w + 1] as const;
const LANTERN_Z = frontOf(WINGS[1]) + 1;

export default defineModel({
  id: 'hotel-c',
  label: 'Hotel C',
  category: 'lodging',
  tiles: { x: 10, z: 5 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  lights: LANTERNS.map((x) => ({
    x,
    y: GROUND + 9,
    z: LANTERN_Z + 1,
    color: LANTERN,
    intensity: 100,
    distance: 58,
  })),
  venue: {
    role: 'lodging',
    capacity: 40,
    beds: 40,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 30,
    doors: [{ x: LOBBY.x + LOBBY.w / 2, z: frontOf(WINGS[1]), facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { glass, grass, sand, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    const floors = Array.from({ length: STOREYS }, (_, i) => ground + 1 + i * STOREY_VOXELS);

    const shutters = { trim: stucco, timber: LOUVRES } as const;
    const rail = { along: 'x', rail: SLATS, pitch: 64 } as const;

    for (const wing of WINGS) {
      const width = widthOf(wing);
      const right = wing.x + width - 1;
      const front = frontOf(wing);
      const brink = front + LOGGIA;
      const body = { x: wing.x + END, z: wing.back + 1, w: width - 2 * END, d: ROOMS };
      const eaves = stuccoWall(b, {
        ...body,
        y: ground,
        storeys: STOREYS,
        wall: stucco,
        trim: stucco,
        skirting: 1,
        quoins: false,
      });

      const piers = [
        { x0: wing.x, x1: wing.x + END - 1 },
        ...Array.from({ length: wing.bays - 1 }, (_, i) => {
          const x0 = bayAt(wing, i) + BAY;
          return { x0, x1: x0 + PIER - 1 };
        }),
        { x0: right - END + 1, x1: right },
      ];
      for (const { x0, x1 } of piers) {
        rubble(b, {
          x: x0,
          z: wing.back,
          w: x1 - x0 + 1,
          d: brink - wing.back + 1,
          y: ground,
          h: eaves - ground,
          stone: sand,
        });
      }

      for (let bay = 0; bay < wing.bays; bay++) {
        const x0 = bayAt(wing, bay);
        const x1 = x0 + BAY - 1;
        const lobby = wing === WINGS[1] && bay === 0;
        b.box(x0, x1, ground, ground, front + 1, brink + 1, stucco.light);
        b.box(x0, x1, eaves - 2, eaves - 1, brink, brink + 1, stucco.light);
        for (const [storey, floor] of floors.entries()) {
          if (storey > 0) {
            b.box(x0, x1, floor - 2, floor - 1, front + 1, brink + 1, stucco.light);
            plankRail(b, { ...rail, x: x0, z: brink + 1, y: floor, w: BAY });
          } else if (!lobby) {
            plankRail(b, { ...rail, x: x0, z: brink, y: floor, w: BAY });
          }
          if (lobby && storey === 0) continue;
          const at = { face: 'z+', at: front, y: floor } as const;
          doorway(b, { ...at, along: x0 + 8, w: 4, trim: stucco, timber: LOUVRES });
          shutteredWindow(b, { ...shutters, ...at, along: x0 + 2, y: floor + 3, w: 3 });
        }
        for (const floor of floors) {
          shutteredWindow(b, {
            ...shutters,
            face: 'z-',
            at: body.z,
            along: x0 + 5,
            y: floor + 3,
            w: 3,
          });
        }
      }

      // Where the wings meet, only the strip the other wing leaves bare gets a window.
      const ends = [wing.back + 8, wing.back + 20, front + 3];
      const near = wing === WINGS[0];
      const sides = [
        { face: 'x-', at: wing.x, along: near ? ends : [wing.back + 5] },
        { face: 'x+', at: right, along: near ? [front + 3] : ends },
      ] as const;
      for (const floor of floors) {
        for (const { face, at, along: spots } of sides) {
          for (const along of spots) {
            shutteredWindow(b, { ...shutters, face, at, along, y: floor + 3, w: 3 });
          }
        }
      }

      const roof = { x: wing.x, z: wing.back, w: width, d: brink + 2 - wing.back + 1 };
      hipRoof(b, { ...roof, y: eaves, step: 3, gutter: teak });
    }

    const [near, far] = WINGS;
    const nearLip = frontOf(near) + LOGGIA + 4;
    const farLip = frontOf(far) + LOGGIA + 4;
    const gutter = ground + STOREYS * STOREY_VOXELS;
    b.box(near.x - 1, near.x - 1, ground, gutter, nearLip - 3, nearLip - 3, teak.deep);
    const farRight = far.x + widthOf(far);
    b.box(farRight, farRight, ground, gutter, farLip - 3, farLip - 3, teak.deep);

    b.box(1, near.x + widthOf(near), ground - 1, ground - 1, nearLip + 1, 78, grass.base);
    b.box(far.x, PLOT.w - 2, ground - 1, ground - 1, farLip + 1, 78, grass.base);
    b.box(LOBBY.x - 1, LOBBY.x + LOBBY.w, ground - 1, ground - 1, LOBBY_FRONT + 1, 79, stone.light);
    b.box(
      far.x,
      farRight - 1,
      ground - 1,
      ground - 1,
      LOBBY_FRONT + 2,
      LOBBY_FRONT + 4,
      stone.light,
    );

    doorway(b, {
      face: 'z+',
      at: frontOf(far),
      along: LOBBY.x,
      y: floors[0]!,
      w: LOBBY.w,
      h: 10,
      trim: stucco,
      timber: glass,
    });
    for (const x of LANTERNS) {
      b.box(x, x + 1, ground + 6, ground + 10, LANTERN_Z, LANTERN_Z, PALETTE.metal.deep);
      b.box(x, x + 1, ground + 7, ground + 9, LANTERN_Z, LANTERN_Z, LANTERN);
    }

    // Oleanders kept low so they hide no loggia, as in the reference.
    for (const [x, z] of [
      [12, 66],
      [60, 70],
      [118, 62],
      [146, 70],
    ] as const) {
      oleander(b, { x, z, y: ground });
    }

    for (const [x, z] of [
      [30, 66],
      [128, 66],
      [134, 56],
    ] as const) {
      picnicTable(b, { x, z, y: ground });
    }
  },
});
