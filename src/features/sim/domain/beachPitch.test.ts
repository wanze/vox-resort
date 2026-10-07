import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING } from '../../crowd/domain/crowd';
import type { SeatSpot } from '../../crowd/domain/seating';
import { blockedAt, type ObstacleBox } from '../../crowd/domain/sandGrid';
import {
  BEACH_SURFACE,
  walkNetworkFor,
  type PavedTile,
  type WalkNetwork,
} from '../../crowd/domain/walkNetwork';
import { beachDepthAt, shoreFor, terrainAt } from '../../layout/domain/shoreline';
import { pitchFor, type PitchInput } from './beachPitch';

const shore = shoreFor({
  tilesX: 20,
  tilesZ: 20,
  shore: { inset: 1, beach: 6, wave: 0, seed: 1 },
})!;

const path: PavedTile[] = Array.from({ length: 6 }, (_, index) => ({
  tileX: 10,
  tileZ: 6 + index,
  y: 0,
}));

const beachOf = (seats: SeatSpot[] = [], obstacles: ObstacleBox[] = []): WalkNetwork =>
  walkNetworkFor({ paved: path, levelOf: () => 0, shore, tilesX: 20, seats, obstacles });

const lounger = (tileX: number, tileZ: number): SeatSpot => ({
  x: (tileX + 0.5) * TILE_VOXELS,
  z: (tileZ + 0.5) * TILE_VOXELS,
  y: BEACH_SURFACE + 5,
  heading: 0,
  pose: 'lie',
  tileX,
  tileZ,
});

const FAMILY = [{ child: false }, { child: false }, { child: true }];

const inputFor = (network: WalkNetwork, overrides: Partial<PitchInput> = {}): PitchInput => ({
  network,
  gate: network.gates[0]!,
  members: FAMILY,
  taken: new Set(),
  loungerFree: () => true,
  ...overrides,
});

const tileOf = (point: { readonly x: number; readonly z: number }) => ({
  tileX: Math.floor(point.x / TILE_VOXELS),
  tileZ: Math.floor(point.z / TILE_VOXELS),
});

// Shade counts only in a heatwave, so every other day must pitch as if there were none.
const MILD_DAYS = [
  { name: 'with no shade', day: {} },
  { name: 'with shade everywhere on a mild day', day: { shaded: () => true, hot: false } },
] as const satisfies readonly { name: string; day: Partial<PitchInput> }[];

describe.each(MILD_DAYS)('pitchFor $name', ({ day }) => {
  const inputOn = (network: WalkNetwork, overrides: Partial<PitchInput> = {}): PitchInput =>
    inputFor(network, { ...day, ...overrides });

  it('pitches out of the walkway on an open beach, a spot of sand each', () => {
    const network = beachOf();
    expect(network.gates).toHaveLength(1);
    const pitch = pitchFor(inputOn(network))!;
    expect(tileOf(pitch)).toEqual({ tileX: 10, tileZ: 14 });
    expect(pitch.tile).toBe(14 * 20 + 10);
    expect(pitch.spots).toHaveLength(3);
    expect(pitch.spots.map((spot) => spot.pose)).toEqual([
      RESTING.lying,
      RESTING.lying,
      RESTING.sitting,
    ]);
    expect(pitch.spots.map((spot) => spot.seat)).toEqual([-1, -1, -1]);
    expect(pitch.spots[0]!.y).toBe(BEACH_SURFACE);
    expect(pitch.spots[2]!.y).toBeGreaterThan(BEACH_SURFACE);
    for (const spot of pitch.spots) {
      const { tileX, tileZ } = tileOf(spot);
      expect(terrainAt(shore, tileX, tileZ)).toBe('beach');
      expect(blockedAt(network.sand!, spot.x, spot.z)).toBe(false);
      expect(spot.heading).toBe(0);
    }
    const xs = pitch.spots.map((spot) => `${spot.x},${spot.z}`);
    expect(new Set(xs).size).toBe(3);
  });

  it('lies both adults of a family on the loungers beside the gate, and sits the child on the sand', () => {
    const network = beachOf([lounger(9, 12), lounger(11, 12)]);
    expect(network.beachSeats).toHaveLength(2);
    const pitch = pitchFor(inputOn(network))!;
    const [first, second, child] = pitch.spots as [
      (typeof pitch.spots)[0],
      (typeof pitch.spots)[0],
      (typeof pitch.spots)[0],
    ];
    expect(new Set([first.seat, second.seat])).toEqual(new Set(network.beachSeats));
    expect([first.pose, second.pose]).toEqual([RESTING.lying, RESTING.lying]);
    expect(first.y).toBe(network.seats[first.seat]!.y);
    expect(child.seat).toBe(-1);
    expect(child.pose).toBe(RESTING.sitting);
  });

  it('walks the adults past open sand to free loungers further than a towel is carried', () => {
    const network = beachOf([lounger(0, 17), lounger(2, 17)]);
    expect(network.beachSeats).toHaveLength(2);
    const pitch = pitchFor(inputOn(network))!;
    const { tileX, tileZ } = tileOf(pitch);
    expect(Math.abs(tileX - 10) + Math.abs(tileZ - 12)).toBeGreaterThan(12);
    expect(new Set(pitch.spots.map((spot) => spot.seat))).toEqual(
      new Set([...network.beachSeats, -1]),
    );
  });

  it('passes over a lounger somebody else holds', () => {
    const network = beachOf([lounger(9, 12), lounger(11, 12)]);
    const [held] = network.beachSeats as [number];
    const pitch = pitchFor(inputOn(network, { loungerFree: (seat) => seat !== held }))!;
    expect(pitch.spots.map((spot) => spot.seat)).not.toContain(held);
    expect(tileOf(pitch)).toEqual({ tileX: 10, tileZ: 12 });
    expect(pitch.spots.filter((spot) => spot.seat >= 0)).toHaveLength(1);
  });

  it('skips a tile another party has pitched on for the next nearest', () => {
    const network = beachOf();
    const first = pitchFor(inputOn(network))!;
    const second = pitchFor(inputOn(network, { taken: new Set([first.tile]) }))!;
    expect(second.tile).not.toBe(first.tile);
    const { tileX, tileZ } = tileOf(second);
    expect(Math.abs(tileX - 10) + Math.abs(tileZ - 12)).toBeGreaterThanOrEqual(2);
    expect(Math.abs(tileX - 10) + Math.abs(tileZ - 12)).toBeLessThanOrEqual(3);
  });

  it('gives nothing when the beach within reach of the gate is all in use', () => {
    const covered = beachOf(
      [],
      [{ x: 0, z: 12 * TILE_VOXELS, width: 20 * TILE_VOXELS, depth: 96 }],
    );
    expect(pitchFor(inputOn(covered))).toBeNull();
    expect(pitchFor(inputOn(beachOf(), { members: [] }))).toBeNull();
  });

  it('gives the same pitch for the same beach twice', () => {
    const network = beachOf([lounger(9, 13), lounger(12, 14)]);
    expect(pitchFor(inputOn(network))).toEqual(pitchFor(inputOn(network)));
  });
});

describe.each(MILD_DAYS)('a watch pitch $name', ({ day }) => {
  const inputOn = (network: WalkNetwork, overrides: Partial<PitchInput> = {}): PitchInput =>
    inputFor(network, { ...day, ...overrides });
  const watching = (network: WalkNetwork, overrides: Partial<PitchInput> = {}) =>
    pitchFor(inputOn(network, { watch: true, ...overrides }))!;

  it('stands the grown-ups and sits the children, all facing the sea', () => {
    const pitch = watching(beachOf());
    expect(pitch.spots.map((spot) => spot.pose)).toEqual([
      RESTING.standing,
      RESTING.standing,
      RESTING.sitting,
    ]);
    expect(pitch.spots.every((spot) => spot.heading === 0)).toBe(true);
    expect(pitch.spots[0]!.y).toBe(BEACH_SURFACE);
  });

  it('takes the front rows while there is room, and further back once they are full', () => {
    const network = beachOf();
    const front = watching(network);
    const { tileX, tileZ } = tileOf(front);
    expect(beachDepthAt(shore, tileX, tileZ)).toBeLessThanOrEqual(1);
    const taken = new Set<number>();
    for (let x = 0; x < 20; x++) for (const z of [16, 17]) taken.add(z * 20 + x);
    const back = tileOf(watching(network, { taken }));
    expect(beachDepthAt(shore, back.tileX, back.tileZ)).toBeGreaterThan(1);
  });

  it('leaves the loungers beside it to those come to lie on them', () => {
    const network = beachOf([lounger(9, 16), lounger(11, 16)]);
    const pitch = watching(network);
    expect(pitch.spots.every((spot) => spot.seat === -1)).toBe(true);
  });

  it('stands a party of five in two rows, the second further from the water', () => {
    const five = [...FAMILY, { child: false }, { child: false }];
    const pitch = watching(beachOf(), { members: five });
    const rows = [...new Set(pitch.spots.map((spot) => spot.z))].toSorted((a, b) => b - a);
    expect(rows).toHaveLength(2);
    expect(pitch.spots.slice(0, 3).every((spot) => spot.z === rows[0])).toBe(true);
    expect(pitch.spots.slice(3).every((spot) => spot.z === rows[1])).toBe(true);
  });
});

describe('a pitch in a heatwave', () => {
  const OPEN = 14 * 20 + 10;
  const SHADED = 14 * 20 + 13;
  const hot = { hot: true, shaded: (tile: number) => tile === SHADED };

  it('walks past open sand to a shaded tile three tiles further', () => {
    const network = beachOf();
    expect(pitchFor(inputFor(network))!.tile).toBe(OPEN);
    const pitch = pitchFor(inputFor(network, hot))!;
    expect(pitch.tile).toBe(SHADED);
    expect(pitch.spots.map((spot) => spot.seat)).toEqual([-1, -1, -1]);
  });

  it('still takes a free lounger before the shade', () => {
    const network = beachOf([lounger(9, 12), lounger(11, 12)]);
    const pitch = pitchFor(inputFor(network, hot))!;
    expect(pitch.tile).not.toBe(SHADED);
    expect(pitch.spots.filter((spot) => spot.seat >= 0)).toHaveLength(2);
  });

  it('pitches on open sand when no tile is shaded', () => {
    const network = beachOf();
    expect(pitchFor(inputFor(network, { hot: true, shaded: () => false }))!.tile).toBe(OPEN);
  });
});
