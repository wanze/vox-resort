import { describe, expect, it } from 'vitest';
import {
  derivedKey,
  place,
  railModelsIn,
  type LayoutItem,
  type Placement,
  type Tile,
} from '../../layout/domain/resortLayout';
import type { LevelProvider } from '../../layout/domain/elevation';
import {
  BOARDWALK_ID,
  BRIDGE_RAILING_ID,
  BRIDGE_RAMP_RAILING_LEFT_ID,
  BRIDGE_RAMP_RAILING_RIGHT_ID,
  PATH_ID,
  RAILING_ID,
  STAIR_RAILING_ID,
  STAIRS_ID,
} from '../../layout/domain/resortPlan';
import { railChangeAt, reRailAround, type HandrailRules } from './handrails';
import type { PavedGround } from './paving';

const item = (id: string, width = 16, depth = 16): LayoutItem => ({
  id,
  tilesX: 1,
  tilesZ: 1,
  width,
  depth,
});

const PATH = item(PATH_ID);
const STAIRS = item(STAIRS_ID);
// A rail is a strip along one edge of its tile rather than a tile-sized model.
const CATALOGUE = [
  PATH,
  item(BOARDWALK_ID),
  STAIRS,
  item(RAILING_ID, 16, 2),
  item(STAIR_RAILING_ID),
  item(BRIDGE_RAILING_ID, 16, 2),
  item(BRIDGE_RAMP_RAILING_LEFT_ID, 16, 2),
  item(BRIDGE_RAMP_RAILING_RIGHT_ID, 16, 2),
];

const groundOf =
  (rows: readonly string[]): LevelProvider =>
  (tileX, tileZ) =>
    Number(rows[tileZ]?.[tileX] ?? 0);

const pavedOf =
  (tiles: readonly Tile[]): PavedGround =>
  (tileX, tileZ) =>
    tiles.some((tile) => tile.x === tileX && tile.z === tileZ) ? PATH : null;

const standingOf = (rails: readonly Placement[]) => (tileX: number, tileZ: number) =>
  rails.filter((rail) => rail.tileX === tileX && rail.tileZ === tileZ);

const rules = (parts: Partial<HandrailRules> = {}): HandrailRules => ({
  pavedWith: () => null,
  levelOf: () => 0,
  isWater: () => false,
  isSpan: () => false,
  models: railModelsIn(CATALOGUE),
  standing: () => [],
  ...parts,
});

const railsOf = (placements: readonly Placement[]) =>
  placements
    .map((rail) => ({ id: rail.id, x: rail.tileX, z: rail.tileZ, rotation: rail.rotation }))
    .toSorted(
      (a, b) => a.id.localeCompare(b.id) || a.x - b.x || a.z - b.z || a.rotation - b.rotation,
    );

const bench = groundOf(['1111', '1111', '0000', '0000']);

describe('railChangeAt', () => {
  it('rails the edge of a tile just paved on the lip of a drop', () => {
    const paved = [{ x: 1, z: 1 }];
    const change = railChangeAt(
      { x: 1, z: 1 },
      rules({ pavedWith: pavedOf(paved), levelOf: bench }),
    );
    expect(railsOf(change.stand)).toEqual([{ id: RAILING_ID, x: 1, z: 1, rotation: 2 }]);
    expect(change.lift).toEqual([]);
  });

  it('stands an edge rail flush against the edge it guards', () => {
    const change = railChangeAt(
      { x: 1, z: 1 },
      rules({ pavedWith: pavedOf([{ x: 1, z: 1 }]), levelOf: bench }),
    );
    const rail = change.stand[0]!;
    expect({ x: rail.x, z: rail.z }).toEqual({ x: 16, z: 16 + 16 - 2 });
  });

  it('takes an edge rail down once the paving carries on across that edge', () => {
    const walk = { x: 1, z: 1 };
    const railed = railChangeAt(walk, rules({ pavedWith: pavedOf([walk]), levelOf: bench })).stand;
    const below = { x: 1, z: 2 };
    const change = railChangeAt(
      below,
      rules({ pavedWith: pavedOf([walk, below]), levelOf: bench, standing: standingOf(railed) }),
    );
    expect(railsOf(change.lift)).toEqual([{ id: RAILING_ID, x: 1, z: 1, rotation: 2 }]);
    expect(railsOf(change.stand)).toEqual([{ id: STAIR_RAILING_ID, x: 1, z: 2, rotation: 0 }]);
  });

  it('swaps a slab’s edge rails for a balustrade when it becomes a flight', () => {
    const step = groundOf(['2222', '2222', '1111', '0000']);
    const lower = { x: 1, z: 2 };
    const edges = railChangeAt(lower, rules({ pavedWith: pavedOf([lower]), levelOf: step })).stand;
    expect(railsOf(edges)).toEqual([{ id: RAILING_ID, x: 1, z: 2, rotation: 2 }]);
    const upper = { x: 1, z: 1 };
    const change = railChangeAt(
      upper,
      rules({ pavedWith: pavedOf([lower, upper]), levelOf: step, standing: standingOf(edges) }),
    );
    expect(railsOf(change.lift)).toEqual([{ id: RAILING_ID, x: 1, z: 2, rotation: 2 }]);
    expect(railsOf(change.stand)).toEqual([{ id: STAIR_RAILING_ID, x: 1, z: 2, rotation: 0 }]);
  });

  it('opens a flight up once a second one is paved beside it', () => {
    const first = [
      { x: 1, z: 1 },
      { x: 1, z: 2 },
    ];
    const guarded = railChangeAt(
      { x: 1, z: 2 },
      rules({ pavedWith: pavedOf(first), levelOf: bench }),
    ).stand;
    expect(railsOf(guarded)).toEqual([{ id: STAIR_RAILING_ID, x: 1, z: 2, rotation: 0 }]);
    const wide = [...first, { x: 2, z: 1 }, { x: 2, z: 2 }];
    const change = railChangeAt(
      { x: 2, z: 2 },
      rules({ pavedWith: pavedOf(wide), levelOf: bench, standing: standingOf(guarded) }),
    );
    expect(railsOf(change.lift)).toEqual([{ id: STAIR_RAILING_ID, x: 1, z: 2, rotation: 0 }]);
    expect(change.stand).toEqual([]);
  });

  it('leaves a rail that already stands where one belongs alone', () => {
    const walk = [
      { x: 1, z: 1 },
      { x: 2, z: 1 },
    ];
    const standing = railChangeAt(
      { x: 1, z: 1 },
      rules({ pavedWith: pavedOf([walk[0]!]), levelOf: bench }),
    ).stand;
    const change = railChangeAt(
      { x: 2, z: 1 },
      rules({ pavedWith: pavedOf(walk), levelOf: bench, standing: standingOf(standing) }),
    );
    expect(railsOf(change.stand)).toEqual([{ id: RAILING_ID, x: 2, z: 1, rotation: 2 }]);
    expect(change.lift).toEqual([]);
  });

  it('rails nothing when the thing placed was not paving at all', () => {
    const change = railChangeAt({ x: 1, z: 1 }, rules({ levelOf: bench }));
    expect(change).toEqual({ stand: [], lift: [] });
  });

  it('rails nothing on flat ground', () => {
    const paved = [{ x: 1, z: 1 }];
    expect(railChangeAt({ x: 1, z: 1 }, rules({ pavedWith: pavedOf(paved) }))).toEqual({
      stand: [],
      lift: [],
    });
  });

  it('stands no rails at all when the catalogue has none', () => {
    const paved = [{ x: 1, z: 1 }];
    const change = railChangeAt(
      { x: 1, z: 1 },
      rules({ pavedWith: pavedOf(paved), levelOf: bench, models: railModelsIn([PATH]) }),
    );
    expect(change).toEqual({ stand: [], lift: [] });
  });

  it('keys a rail the way the layout does, so the two cannot double up', () => {
    const change = railChangeAt(
      { x: 1, z: 1 },
      rules({ pavedWith: pavedOf([{ x: 1, z: 1 }]), levelOf: bench }),
    );
    expect(change.stand[0]!.key).toBe(`${derivedKey(RAILING_ID, 1, 1)}:2`);
  });

  it('takes every rail off a tile whose paving has been taken up', () => {
    const walk = { x: 1, z: 1 };
    const railed = railChangeAt(walk, rules({ pavedWith: pavedOf([walk]), levelOf: bench })).stand;
    const change = railChangeAt(
      walk,
      rules({ pavedWith: pavedOf([]), levelOf: bench, standing: standingOf(railed) }),
    );
    expect(railsOf(change.lift)).toEqual([{ id: RAILING_ID, x: 1, z: 1, rotation: 2 }]);
    expect(change.stand).toEqual([]);
  });

  it('rails the paving left beside a tile that was taken up', () => {
    const walk = { x: 1, z: 1 };
    const below = { x: 1, z: 2 };
    const change = railChangeAt(below, rules({ pavedWith: pavedOf([walk]), levelOf: bench }));
    expect(railsOf(change.stand)).toEqual([{ id: RAILING_ID, x: 1, z: 1, rotation: 2 }]);
  });

  it('never asks for a rail on a tile that is not paved', () => {
    const paved = [{ x: 1, z: 1 }];
    const change = railChangeAt(
      { x: 1, z: 1 },
      rules({ pavedWith: pavedOf(paved), levelOf: bench }),
    );
    for (const rail of change.stand) {
      expect(pavedOf(paved)(rail.tileX, rail.tileZ)).not.toBeNull();
    }
    expect(change.stand[0]!.y).toBe(place(PATH, 'x', 1, 1, 0, 1).y);
  });
});

const channel = (_x: number, tileZ: number): boolean => tileZ >= 1 && tileZ <= 3;

describe('railChangeAt, over a crossing', () => {
  const crossing = [
    { x: 1, z: 0 },
    { x: 1, z: 1 },
    { x: 1, z: 2 },
    { x: 1, z: 3 },
    { x: 1, z: 4 },
  ];

  it('rails a crossing drawn by hand with its own parapets, never the ordinary rail', () => {
    const change = railChangeAt(
      { x: 1, z: 2 },
      rules({ pavedWith: pavedOf(crossing), isWater: channel, isSpan: channel }),
    );
    expect(railsOf(change.stand)).toEqual([
      { id: BRIDGE_RAILING_ID, x: 1, z: 2, rotation: 1 },
      { id: BRIDGE_RAILING_ID, x: 1, z: 2, rotation: 3 },
      { id: BRIDGE_RAMP_RAILING_LEFT_ID, x: 1, z: 1, rotation: 3 },
      { id: BRIDGE_RAMP_RAILING_LEFT_ID, x: 1, z: 3, rotation: 1 },
      { id: BRIDGE_RAMP_RAILING_RIGHT_ID, x: 1, z: 1, rotation: 1 },
      { id: BRIDGE_RAMP_RAILING_RIGHT_ID, x: 1, z: 3, rotation: 3 },
    ]);
  });

  it('opens the middle of a crossing up when a second one is drawn across it', () => {
    const along = railChangeAt(
      { x: 1, z: 2 },
      rules({ pavedWith: pavedOf(crossing), isWater: channel, isSpan: channel }),
    ).stand;
    const across = [...crossing, { x: 0, z: 2 }, { x: 2, z: 2 }];
    const change = railChangeAt(
      { x: 2, z: 2 },
      rules({
        pavedWith: pavedOf(across),
        isWater: channel,
        isSpan: channel,
        standing: standingOf(along),
      }),
    );
    expect(railsOf(change.lift).filter((rail) => rail.z === 2 && rail.x === 1)).toEqual([
      { id: BRIDGE_RAILING_ID, x: 1, z: 2, rotation: 1 },
      { id: BRIDGE_RAILING_ID, x: 1, z: 2, rotation: 3 },
    ]);
  });
});

describe('reRailAround', () => {
  it('says nothing at all when nothing changed', () => {
    let told = 0;
    reRailAround({ x: 1, z: 1 }, rules(), () => {
      told++;
    });
    expect(told).toBe(0);
  });

  it('hands the change over once when there is one', () => {
    const changes: { stand: number; lift: number }[] = [];
    reRailAround(
      { x: 1, z: 1 },
      rules({ levelOf: bench, pavedWith: pavedOf([{ x: 1, z: 1 }]) }),
      (stand, lift) => changes.push({ stand: stand.length, lift: lift.length }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]!.stand).toBeGreaterThan(0);
  });

  it('lifts the rail on an edge that has stopped being a drop', () => {
    const walk = { x: 1, z: 1 };
    const rail = place(
      item(RAILING_ID, 16, 2),
      derivedKey(RAILING_ID, walk.x, walk.z),
      walk.x,
      walk.z,
      2,
      1,
    );
    const changes: Placement[][] = [];
    reRailAround(
      walk,
      rules({
        levelOf: groundOf(['1111', '1111', '1111', '0000']),
        pavedWith: pavedOf([walk]),
        standing: standingOf([rail]),
      }),
      (_stand, lift) => changes.push([...lift]),
    );
    expect(railsOf(changes[0] ?? [])).toEqual(
      railsOf([rail]).filter((entry) => entry.rotation === 2),
    );
  });
});
