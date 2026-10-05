import { describe, expect, it } from 'vitest';
import { derivedKey, place, type LayoutItem, type Tile } from '../../layout/domain/resortLayout';
import type { LevelProvider } from '../../layout/domain/elevation';
import {
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
  JETTY_ID,
  PATH_ID,
  RAMP_FOOT_ID,
  RAMP_HEAD_ID,
  STAIRCASE_ID,
  STAIRS_ID,
} from '../../layout/domain/resortPlan';
import { MOSAIC_PIECES } from '../../../../voxel-gen/mosaics/pieces.ts';
import { mosaicFit, type MosaicKit } from '../../layout/domain/mosaic';
import {
  isPaving,
  pavedGroundOf,
  pavingAt,
  relaidBy,
  remosaicked,
  repaves,
  standsOn,
  unlaidBy,
  type PavedGround,
  type PavingRules,
  type Relaid,
} from './paving';
import { createTileOccupancy } from './tileOccupancy';
import { climbTilesFor } from '../../layout/domain/climbs';
import { createRandom } from '../../layout/domain/random';

const item = (id: string, tilesX = 1, tilesZ = 1): LayoutItem => ({
  id,
  tilesX,
  tilesZ,
  width: tilesX * 16,
  depth: tilesZ * 16,
});

const PATH = item(PATH_ID);
const BOARDWALK = item(BOARDWALK_ID);
const STAIRS = item(STAIRS_ID);
const STAIRCASE = item(STAIRCASE_ID);
const RAMP_FOOT = item(RAMP_FOOT_ID);
const RAMP_HEAD = item(RAMP_HEAD_ID);
const JETTY = item(JETTY_ID);
const BRIDGE = item(BRIDGE_ID);
const BRIDGE_RAMP = item(BRIDGE_RAMP_ID);
const COTTAGE = item('cottage', 2, 3);

const benchAt =
  (z: number): LevelProvider =>
  (_x, tileZ) =>
    tileZ < z ? 1 : 0;

const paved =
  (table: Record<string, LayoutItem>): PavedGround =>
  (tileX, tileZ) =>
    table[`${tileX},${tileZ}`] ?? null;

const rules = (parts: Partial<PavingRules> = {}): PavingRules => ({
  pavedWith: () => null,
  levelOf: () => 0,
  isSand: () => false,
  isWater: () => false,
  isSea: () => true,
  decking: BOARDWALK,
  pier: JETTY,
  bridge: BRIDGE,
  bridgeRamp: BRIDGE_RAMP,
  stairs: STAIRS,
  staircase: STAIRCASE,
  rampFoot: RAMP_FOOT,
  rampHead: RAMP_HEAD,
  flagstones: PATH,
  mosaic: null,
  ...parts,
});

describe('isPaving', () => {
  it('knows every kind of paving a path network is laid with', () => {
    expect([PATH, BOARDWALK, STAIRS, JETTY, BRIDGE].map(isPaving)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('does not treat a building as paving', () => {
    expect(isPaving(COTTAGE)).toBe(false);
  });
});

describe('pavedGroundOf', () => {
  const ground = (): PavedGround =>
    pavedGroundOf(
      createTileOccupancy([
        place(PATH, derivedKey(PATH_ID, 1, 1), 1, 1),
        place(STAIRS, derivedKey(STAIRS_ID, 1, 2), 1, 2),
        place(COTTAGE, 'cottage#0', 4, 4),
      ]),
      [PATH, BOARDWALK, STAIRS, JETTY],
    );

  it('reads the paving on a tile off the live index, without parsing a key', () => {
    expect(ground()(1, 1)).toBe(PATH);
    expect(ground()(1, 2)).toBe(STAIRS);
  });

  it('reports bare ground where nothing stands', () => {
    expect(ground()(9, 9)).toBeNull();
  });

  it('reports a building as unpaved, so no flight ever climbs towards one', () => {
    expect(ground()(4, 4)).toBeNull();
    expect(ground()(5, 6)).toBeNull();
  });
});

describe('pavingAt', () => {
  it('lays the paving as picked on level ground', () => {
    expect(pavingAt(PATH, { x: 2, z: 2 }, 0, rules())).toEqual({ item: PATH, rotation: 0 });
  });

  it('lays a flight where the tile climbs to paving one level up', () => {
    const laid = pavingAt(
      PATH,
      { x: 0, z: 1 },
      0,
      rules({ pavedWith: paved({ '0,0': PATH }), levelOf: benchAt(1) }),
    );
    expect(laid).toEqual({ item: STAIRS, rotation: 0 });
  });

  it('turns the flight at the higher ground, whichever side it is on', () => {
    const facing = (higher: Tile, rotation: number): void => {
      const laid = pavingAt(
        PATH,
        { x: 1, z: 1 },
        0,
        rules({
          pavedWith: paved({ [`${higher.x},${higher.z}`]: PATH }),
          levelOf: (x, z) => (x === higher.x && z === higher.z ? 1 : 0),
        }),
      );
      expect({ higher, laid }).toEqual({ higher, laid: { item: STAIRS, rotation } });
    };
    facing({ x: 1, z: 0 }, 0);
    facing({ x: 0, z: 1 }, 1);
    facing({ x: 1, z: 2 }, 2);
    facing({ x: 2, z: 1 }, 3);
  });

  it('leaves the upper tile of a step an ordinary slab', () => {
    const laid = pavingAt(
      PATH,
      { x: 0, z: 0 },
      0,
      rules({ pavedWith: paved({ '0,1': PATH }), levelOf: benchAt(1) }),
    );
    expect(laid).toEqual({ item: PATH, rotation: 0 });
  });

  it('lays a slab where there is nothing above the step to climb to', () => {
    const laid = pavingAt(PATH, { x: 0, z: 1 }, 0, rules({ levelOf: benchAt(1) }));
    expect(laid).toEqual({ item: PATH, rotation: 0 });
  });

  it('lays decking where the tile is sand', () => {
    expect(pavingAt(PATH, { x: 2, z: 9 }, 0, rules({ isSand: () => true }))).toEqual({
      item: BOARDWALK,
      rotation: 0,
    });
  });

  it('lays flagstones one tile inland, off the same gesture', () => {
    const shore = rules({ isSand: (_x, z) => z >= 9 });
    expect(pavingAt(PATH, { x: 2, z: 9 }, 0, shore).item).toBe(BOARDWALK);
    expect(pavingAt(PATH, { x: 2, z: 8 }, 0, shore).item).toBe(PATH);
  });

  it('lays a flight rather than decking where a step reaches the sand', () => {
    const laid = pavingAt(
      PATH,
      { x: 0, z: 1 },
      0,
      rules({ pavedWith: paved({ '0,0': PATH }), levelOf: benchAt(1), isSand: () => true }),
    );
    expect(laid).toEqual({ item: STAIRS, rotation: 0 });
  });

  it('paves sand in flagstones when the catalogue has no decking', () => {
    const laid = pavingAt(PATH, { x: 2, z: 9 }, 0, rules({ isSand: () => true, decking: null }));
    expect(laid).toEqual({ item: PATH, rotation: 0 });
  });

  it('lays a slab unturned, whatever the R key was left at', () => {
    expect(pavingAt(PATH, { x: 2, z: 2 }, 3, rules()).rotation).toBe(0);
    expect(pavingAt(PATH, { x: 2, z: 9 }, 3, rules({ isSand: () => true }))).toEqual({
      item: BOARDWALK,
      rotation: 0,
    });
  });

  it('stands a building on a step as picked, turn and all, so only paving climbs', () => {
    const laid = pavingAt(
      COTTAGE,
      { x: 0, z: 1 },
      1,
      rules({ pavedWith: paved({ '0,0': PATH }), levelOf: benchAt(1) }),
    );
    expect(laid).toEqual({ item: COTTAGE, rotation: 1 });
  });

  it('keeps the turn the R key asked for on everything it does not decide', () => {
    expect(pavingAt(COTTAGE, { x: 2, z: 2 }, 3, rules()).rotation).toBe(3);
  });

  it('paves a step flat when the catalogue has no flight to lay', () => {
    const laid = pavingAt(
      PATH,
      { x: 0, z: 1 },
      0,
      rules({ pavedWith: paved({ '0,0': PATH }), levelOf: benchAt(1), stairs: null }),
    );
    expect(laid).toEqual({ item: PATH, rotation: 0 });
  });
});

describe('relaidBy', () => {
  it('re-lays nothing on level ground', () => {
    const flat = rules({ pavedWith: paved({ '2,2': PATH, '2,3': PATH }) });
    expect(relaidBy({ x: 2, z: 2 }, flat)).toEqual([]);
  });

  it('turns the slab below a step into the flight up it', () => {
    const relaid = relaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,0': PATH, '0,1': PATH }), levelOf: benchAt(1) }),
    );
    expect(relaid).toEqual([
      {
        placement: place(STAIRS, derivedKey(STAIRS_ID, 0, 1), 0, 1, 0, 0),
        lifted: place(PATH, derivedKey(PATH_ID, 0, 1), 0, 1, 0, 0),
      },
    ]);
  });

  it('lifts the paving that was actually there, decking included', () => {
    const relaid = relaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,0': PATH, '0,1': BOARDWALK }), levelOf: benchAt(1) }),
    );
    expect(relaid.map((one) => one.lifted.key)).toEqual([derivedKey(BOARDWALK_ID, 0, 1)]);
  });

  it('leaves the slab above a step alone, and the tile just paved with it', () => {
    const relaid = relaidBy(
      { x: 0, z: 1 },
      rules({ pavedWith: paved({ '0,0': PATH, '0,1': PATH }), levelOf: benchAt(1) }),
    );
    expect(relaid).toEqual([]);
  });

  it('leaves a tile that is already a flight as it stands', () => {
    const relaid = relaidBy(
      { x: 1, z: 1 },
      rules({
        pavedWith: paved({ '1,1': PATH, '0,1': STAIRS, '0,0': PATH }),
        levelOf: (_x, z) => (z < 1 ? 1 : 0),
      }),
    );
    expect(relaid).toEqual([]);
  });

  it('re-lays every slab the new tile is now the top of', () => {
    const relaid = relaidBy(
      { x: 1, z: 1 },
      rules({
        pavedWith: paved({ '1,1': PATH, '1,2': PATH, '2,1': PATH }),
        levelOf: (x, z) => (x === 1 && z === 1 ? 1 : 0),
      }),
    );
    expect(
      relaid.map((one) => ({ tile: { x: one.placement.tileX, z: one.placement.tileZ } })),
    ).toEqual([{ tile: { x: 1, z: 2 } }, { tile: { x: 2, z: 1 } }]);
    expect(relaid.map((one) => one.placement.rotation)).toEqual([0, 1]);
  });

  it('stands the flight on the level of the tile it replaces, not the new one', () => {
    const relaid = relaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,0': PATH, '0,1': PATH }), levelOf: benchAt(1) }),
    );
    expect(relaid[0]!.placement.y).toBe(0);
    expect(place(PATH, 'path@0,0', 0, 0, 0, 1).y).toBeGreaterThan(0);
  });

  it('re-lays nothing when the catalogue has no flight to lay', () => {
    const relaid = relaidBy(
      { x: 0, z: 0 },
      rules({
        pavedWith: paved({ '0,0': PATH, '0,1': PATH }),
        levelOf: benchAt(1),
        stairs: null,
      }),
    );
    expect(relaid).toEqual([]);
  });
});

const laidOf = (relaid: readonly Relaid[]) =>
  relaid.map(({ placement }) => ({
    id: placement.id,
    x: placement.tileX,
    z: placement.tileZ,
    rotation: placement.rotation,
  }));

describe('unlaidBy', () => {
  it('lays a flight flat again once the tile it climbed to is taken up', () => {
    const relaid = unlaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,1': STAIRS }), levelOf: benchAt(1) }),
    );
    expect(laidOf(relaid)).toEqual([{ id: PATH_ID, x: 0, z: 1, rotation: 0 }]);
    expect(relaid[0]!.lifted.key).toBe(derivedKey(STAIRS_ID, 0, 1));
  });

  it('lays decking rather than flagstones where the flight stands on sand', () => {
    const relaid = unlaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,1': STAIRS }), levelOf: benchAt(1), isSand: () => true }),
    );
    expect(laidOf(relaid)).toEqual([{ id: BOARDWALK_ID, x: 0, z: 1, rotation: 0 }]);
  });

  it('turns a flight to the paving it still climbs to', () => {
    const relaid = unlaidBy(
      { x: 1, z: 0 },
      rules({
        pavedWith: paved({ '1,1': STAIRS, '0,1': PATH }),
        levelOf: (x, z) => (x === 1 && z === 1 ? 0 : 1),
      }),
    );
    expect(laidOf(relaid)).toEqual([{ id: STAIRS_ID, x: 1, z: 1, rotation: 1 }]);
  });

  it('leaves the flat paving around a removed tile alone', () => {
    const flat = rules({ pavedWith: paved({ '2,1': PATH, '1,2': BOARDWALK }) });
    expect(unlaidBy({ x: 1, z: 1 }, flat)).toEqual([]);
  });

  it('leaves the flight when the catalogue has nothing flat to lay', () => {
    const relaid = unlaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,1': STAIRS }), levelOf: benchAt(1), flagstones: null }),
    );
    expect(relaid).toEqual([]);
  });

  it('takes a crossing back off a bank that has been taken up', () => {
    const river = rules({
      isWater: (_x, tileZ) => tileZ === 5,
      isSea: () => false,
      pavedWith: paved({ '2,5': BRIDGE_RAMP }),
    });
    const relaid = unlaidBy({ x: 2, z: 4 }, river);
    expect(laidOf(relaid)).toEqual([{ id: BRIDGE_ID, x: 2, z: 5, rotation: 0 }]);
    expect(relaid[0]!.lifted.id).toBe(BRIDGE_RAMP_ID);
  });

  it('takes back exactly what paving the tile made', () => {
    const levelOf = benchAt(1);
    const made = relaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,0': PATH, '0,1': PATH }), levelOf }),
    );
    const unmade = unlaidBy(
      { x: 0, z: 0 },
      rules({ pavedWith: paved({ '0,1': STAIRS }), levelOf }),
    );
    expect(unmade[0]!.placement).toEqual(made[0]!.lifted);
  });
});

describe('pavingAt, over water', () => {
  const sea = rules({ isWater: (_x, tileZ) => tileZ >= 5 });

  it('lays a jetty where a path is drawn off the shore', () => {
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, sea).item).toBe(JETTY);
  });

  it('still lays flagstones on the tile behind it', () => {
    expect(pavingAt(PATH, { x: 2, z: 4 }, 0, sea).item).toBe(PATH);
  });

  it('lays a jetty flat, because the sea has no step to climb', () => {
    const climbing = rules({
      isWater: (_x, tileZ) => tileZ >= 5,
      pavedWith: (tileX, tileZ) => (tileX === 2 && tileZ === 4 ? PATH : null),
      levelOf: (_x, tileZ) => (tileZ < 5 ? 1 : 0),
    });
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, climbing)).toEqual({ item: JETTY, rotation: 0 });
  });

  it('leaves the sea unpavable when the catalogue has no jetty', () => {
    const none = rules({ isWater: () => true, pier: null });
    expect(standsOn(PATH, { x: 2, z: 5 }, none)).toBe(false);
  });
});

describe('pavingAt, over a river', () => {
  const river = rules({ isWater: (_x, tileZ) => tileZ === 5, isSea: () => false });

  const crossing = rules({
    isWater: (_x, tileZ) => tileZ === 5 || tileZ === 6,
    isSea: () => false,
    pavedWith: (tileX, tileZ) => (tileX === 2 && (tileZ === 4 || tileZ === 7) ? PATH : null),
  });

  it('lays a bridge rather than a pier, which is the one thing they differ on', () => {
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, river).item).toBe(BRIDGE);
  });

  it('lays the deck unturned where the crossing has no shape yet', () => {
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, river)).toEqual({ item: BRIDGE, rotation: 0 });
  });

  it('brings the tile beside a bank ashore, turned to face it', () => {
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, crossing)).toEqual({
      item: BRIDGE_RAMP,
      rotation: 0,
    });
    expect(pavingAt(PATH, { x: 2, z: 6 }, 0, crossing)).toEqual({
      item: BRIDGE_RAMP,
      rotation: 2,
    });
  });

  it('lays the deck where the catalogue has no ramp, so a crossing is never a gap', () => {
    const none = rules({
      isWater: (_x, tileZ) => tileZ === 5,
      isSea: () => false,
      bridgeRamp: null,
      pavedWith: (tileX, tileZ) => (tileX === 2 && tileZ === 4 ? PATH : null),
    });
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, none).item).toBe(BRIDGE);
  });

  it('lets either half of a crossing stand on the water it crosses', () => {
    expect(standsOn(BRIDGE_RAMP, { x: 2, z: 5 }, river)).toBe(true);
    expect(standsOn(BRIDGE_RAMP, { x: 2, z: 5 }, rules({ isWater: () => true }))).toBe(false);
  });

  it('brings a span ashore when the bank beside it is paved', () => {
    const banked = rules({
      isWater: (_x, tileZ) => tileZ === 5,
      isSea: () => false,
      pavedWith: (tileX, tileZ) =>
        tileX === 2 ? (tileZ === 5 ? BRIDGE : tileZ === 6 ? PATH : null) : null,
    });
    const relaid = relaidBy({ x: 2, z: 6 }, banked);
    expect(
      relaid.map((one) => ({ id: one.placement.id, rotation: one.placement.rotation })),
    ).toEqual([{ id: BRIDGE_RAMP_ID, rotation: 2 }]);
    expect(relaid[0]!.lifted.id).toBe(BRIDGE_ID);
  });

  it('re-lays nothing beside a crossing when what went down is not paving', () => {
    const banked = rules({
      isWater: (_x, tileZ) => tileZ === 5,
      isSea: () => false,
      pavedWith: (tileX, tileZ) => (tileX === 2 && tileZ === 5 ? BRIDGE : null),
    });
    expect(relaidBy({ x: 2, z: 6 }, banked)).toEqual([]);
  });

  it('leaves a river unpavable when the catalogue has no bridge', () => {
    const none = rules({ isWater: () => true, isSea: () => false, bridge: null });
    expect(standsOn(PATH, { x: 2, z: 5 }, none)).toBe(false);
  });

  it('keeps the two spans to their own water', () => {
    expect(standsOn(BRIDGE, { x: 2, z: 5 }, river)).toBe(true);
    expect(standsOn(JETTY, { x: 2, z: 5 }, river)).toBe(false);
    const sea = rules({ isWater: (_x, tileZ) => tileZ >= 5 });
    expect(standsOn(JETTY, { x: 2, z: 5 }, sea)).toBe(true);
    expect(standsOn(BRIDGE, { x: 2, z: 5 }, sea)).toBe(false);
  });
});

describe('standsOn', () => {
  const sea = rules({ isWater: (_x, tileZ) => tileZ >= 5 });

  it('lets the pier, and only the pier, stand on water', () => {
    expect(standsOn(JETTY, { x: 2, z: 5 }, sea)).toBe(true);
    expect(standsOn(COTTAGE, { x: 2, z: 5 }, sea)).toBe(false);
    expect(standsOn(PATH, { x: 2, z: 5 }, sea)).toBe(false);
  });

  it('refuses nothing on dry ground', () => {
    expect(standsOn(COTTAGE, { x: 2, z: 4 }, sea)).toBe(true);
    expect(standsOn(JETTY, { x: 2, z: 4 }, sea)).toBe(true);
  });

  it('holds an object that declares its ground to it', () => {
    const beach = rules({
      isWater: (_x, tileZ) => tileZ >= 5,
      isSea: (_x, tileZ) => tileZ >= 5,
      isSand: (_x, tileZ) => tileZ >= 2 && tileZ < 5,
    });
    const lounger = { ...item('sun-lounger'), ground: 'beach' as const };
    const hut = { ...item('pedalo-rental', 2, 2), ground: 'shore' as const };
    expect(standsOn(lounger, { x: 0, z: 1 }, beach)).toBe(false);
    expect(standsOn(lounger, { x: 0, z: 2 }, beach)).toBe(true);
    expect(standsOn(lounger, { x: 0, z: 5 }, beach)).toBe(false);
    expect(standsOn(hut, { x: 0, z: 2 }, beach)).toBe(true);
    expect(standsOn(hut, { x: 0, z: 4 }, beach)).toBe(true);
    expect(standsOn(COTTAGE, { x: 0, z: 1 }, beach)).toBe(true);
  });
});

interface Laid {
  readonly id: string;
  readonly rotation: number;
}

// Plays the pointers: what pavingAt lays, then what relaidBy or unlaidBy re-lays, then the mosaic
// beside it, on a live table.
function sketchpad(
  levelOf: LevelProvider,
  start: Record<string, Laid> = {},
  mosaic: MosaicKit | null = null,
) {
  const items = new Map(
    [PATH, BOARDWALK, STAIRS, STAIRCASE, RAMP_FOOT, RAMP_HEAD].map((one) => [one.id, one]),
  );
  const table = new Map(Object.entries(start));
  const live = rules({
    levelOf,
    mosaic,
    pavedWith: (x, z) => {
      const laid = table.get(`${x},${z}`);
      return laid ? (items.get(laid.id) ?? item(laid.id)) : null;
    },
  });
  const apply = (relaid: readonly Relaid[]): readonly Relaid[] => {
    for (const { placement } of relaid) {
      table.set(`${placement.tileX},${placement.tileZ}`, {
        id: placement.id,
        rotation: placement.rotation,
      });
    }
    return relaid;
  };
  const styleOn = (x: number, z: number): string | null => {
    const laid = live.pavedWith(x, z);
    return laid && mosaic ? mosaic.styleOf(laid.id) : null;
  };
  return {
    paint(x: number, z: number, picked = PATH): readonly Relaid[] {
      const laid = pavingAt(picked, { x, z }, 0, live);
      table.set(`${x},${z}`, { id: laid.item.id, rotation: laid.rotation });
      const climbs = apply(relaidBy({ x, z }, live));
      return apply(remosaicked({ tile: { x, z }, before: null }, climbs, live));
    },
    remove(x: number, z: number): readonly Relaid[] {
      const before = styleOn(x, z);
      table.delete(`${x},${z}`);
      const climbs = apply(unlaidBy({ x, z }, live));
      return apply(remosaicked({ tile: { x, z }, before }, climbs, live));
    },
    get state(): Record<string, Laid> {
      return Object.fromEntries([...table].toSorted(([a], [b]) => a.localeCompare(b)));
    },
  };
}

const RAMP_UP: Record<string, Laid> = {
  '0,0': { id: PATH_ID, rotation: 0 },
  '0,1': { id: RAMP_HEAD_ID, rotation: 0 },
  '0,2': { id: RAMP_FOOT_ID, rotation: 0 },
};

describe('drawing a path up a step', () => {
  const orders: readonly (readonly number[])[] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];

  it.each(orders)('lays the same ramp whichever order the tiles go down in: %j', (...order) => {
    const pad = sketchpad(benchAt(1));
    for (const z of order) pad.paint(0, z);
    expect(pad.state).toEqual(RAMP_UP);
  });

  it('turns the head into stairs once its foot is taken up', () => {
    const pad = sketchpad(benchAt(1), RAMP_UP);
    pad.remove(0, 2);
    expect(pad.state).toEqual({
      '0,0': { id: PATH_ID, rotation: 0 },
      '0,1': { id: STAIRS_ID, rotation: 0 },
    });
  });

  it('lays both halves flat once the top is taken up', () => {
    const pad = sketchpad(benchAt(1), RAMP_UP);
    pad.remove(0, 0);
    expect(pad.state).toEqual({
      '0,1': { id: PATH_ID, rotation: 0 },
      '0,2': { id: PATH_ID, rotation: 0 },
    });
  });

  it('keeps a staircase the player put at the step when a foot is drawn below it', () => {
    const pad = sketchpad(benchAt(1));
    pad.paint(0, 0);
    pad.paint(0, 1, STAIRCASE);
    pad.paint(0, 2);
    expect(pad.state).toEqual({
      '0,0': { id: PATH_ID, rotation: 0 },
      '0,1': { id: STAIRCASE_ID, rotation: 0 },
      '0,2': { id: PATH_ID, rotation: 0 },
    });
  });

  it('lays a staircase drawn on level ground as flagstones', () => {
    expect(pavingAt(STAIRCASE, { x: 3, z: 3 }, 0, rules())).toEqual({ item: PATH, rotation: 0 });
  });

  it("turns an old save's flight into a ramp once its foot is drawn", () => {
    const pad = sketchpad(benchAt(1), {
      '0,0': { id: PATH_ID, rotation: 0 },
      '0,1': { id: STAIRS_ID, rotation: 0 },
    });
    pad.paint(0, 2);
    expect(pad.state).toEqual(RAMP_UP);
  });

  it('settles on what the generated plot lays, whatever order a drag paints it in', () => {
    const random = createRandom(7);
    for (let scene = 0; scene < 40; scene++) {
      const heights = new Map<string, number>();
      const levelOf: LevelProvider = (x, z) => heights.get(`${x},${z}`) ?? 0;
      const tiles: Tile[] = [];
      for (let x = 0; x < 6; x++) {
        for (let z = 0; z < 6; z++) {
          heights.set(`${x},${z}`, Math.floor(random() * 2) + (z < 3 ? 1 : 0));
          if (random() < 0.6) tiles.push({ x, z });
        }
      }
      const order = tiles.toSorted(() => random() - 0.5);
      const pad = sketchpad(levelOf);
      for (const tile of order) pad.paint(tile.x, tile.z);
      const whole = new Map(
        climbTilesFor(tiles, levelOf, () => false).map((climb) => [
          `${climb.tile.x},${climb.tile.z}`,
          { id: climb.kind === 'stairs' ? STAIRS_ID : climb.kind, rotation: climb.rotation },
        ]),
      );
      const expected = Object.fromEntries(
        tiles
          .map((tile): [string, Laid] => {
            const key = `${tile.x},${tile.z}`;
            return [key, whole.get(key) ?? { id: PATH_ID, rotation: 0 }];
          })
          .toSorted(([a], [b]) => a.localeCompare(b)),
      );
      expect(pad.state).toEqual(expected);
    }
  });
});

// Each style's own model is its single, as in the catalogue, so a lone tile is laid as the style.
const mosaicKit = (styles: readonly string[]): MosaicKit => ({
  styleOf: (id) => styles.find((style) => id === style || id.startsWith(`${style}-`)) ?? null,
  pieceFor(style, bordered) {
    const fit = mosaicFit(bordered, MOSAIC_PIECES);
    const name = fit && MOSAIC_PIECES[fit.piece]!.name;
    return (
      fit && { item: item(fit.piece === 0 ? style : `${style}-${name}`), rotation: fit.rotation }
    );
  },
});

// Longest first, so a calçada piece is not taken for the terracotta style it prefixes.
const TILES = item('mosaic');
const OTHER = item('mosaic-calcada');
const KIT = mosaicKit(['mosaic-calcada', 'mosaic']);
const level = (): number => 0;
const knoll: LevelProvider = (x, z) => (x === 1 && z === 1 ? 1 : 0);

describe('laying mosaic', () => {
  it('lays a lone tile as its style, unturned whatever the R key was left at', () => {
    expect(pavingAt(TILES, { x: 2, z: 2 }, 3, rules({ mosaic: KIT }))).toEqual({
      item: TILES,
      rotation: 0,
    });
  });

  it('lays a tile beside one of its style as an end open towards it', () => {
    const laid = pavingAt(
      TILES,
      { x: 2, z: 2 },
      0,
      rules({ mosaic: KIT, pavedWith: paved({ '2,1': item('mosaic-centre') }) }),
    );
    expect(laid).toEqual({ item: item('mosaic-end'), rotation: 2 });
  });

  it('lays decking on sand and a flight on a step, as a path would', () => {
    expect(pavingAt(TILES, { x: 2, z: 9 }, 0, rules({ mosaic: KIT, isSand: () => true }))).toEqual({
      item: BOARDWALK,
      rotation: 0,
    });
    const step = rules({ mosaic: KIT, pavedWith: paved({ '0,0': PATH }), levelOf: benchAt(1) });
    expect(pavingAt(TILES, { x: 0, z: 1 }, 0, step)).toEqual({ item: STAIRS, rotation: 0 });
  });

  it('re-lays the first tile as an end once a second is laid beside it', () => {
    const pad = sketchpad(level, {}, KIT);
    pad.paint(0, 0, TILES);
    pad.paint(1, 0, TILES);
    expect(pad.state).toEqual({
      '0,0': { id: 'mosaic-end', rotation: 1 },
      '1,0': { id: 'mosaic-end', rotation: 3 },
    });
  });

  it('re-lays nothing when a plain path or another style goes down beside it', () => {
    const pad = sketchpad(level, {}, KIT);
    pad.paint(0, 0, TILES);
    expect(pad.paint(1, 0)).toEqual([]);
    expect(pad.paint(0, 1, OTHER)).toEqual([]);
    expect(pad.state).toEqual({
      '0,0': { id: 'mosaic', rotation: 0 },
      '0,1': { id: 'mosaic-calcada', rotation: 0 },
      '1,0': { id: PATH_ID, rotation: 0 },
    });
  });

  it('re-lays both ends of a strip as singles once its middle is taken up', () => {
    const pad = sketchpad(level, {}, KIT);
    for (const x of [0, 1, 2]) pad.paint(x, 0, TILES);
    expect(pad.state['1,0']).toEqual({ id: 'mosaic-strip', rotation: 0 });
    pad.remove(1, 0);
    expect(pad.state).toEqual({
      '0,0': { id: 'mosaic', rotation: 0 },
      '2,0': { id: 'mosaic', rotation: 0 },
    });
  });

  it('borders the mosaic beside a tile a flight is laid over', () => {
    const pad = sketchpad(benchAt(1), {}, KIT);
    pad.paint(0, 1, TILES);
    pad.paint(1, 1, TILES);
    pad.paint(0, 0);
    expect(pad.state).toEqual({
      '0,0': { id: PATH_ID, rotation: 0 },
      '0,1': { id: STAIRS_ID, rotation: 0 },
      '1,1': { id: 'mosaic', rotation: 0 },
    });
  });

  it('re-lays a tile two flights border once', () => {
    const pad = sketchpad(knoll, {}, KIT);
    for (const [x, z] of [
      [0, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      pad.paint(x, z, TILES);
    }
    const relaid = pad.paint(1, 1);
    expect(relaid.map(({ placement }) => placement.key)).toEqual(['mosaic@0,0']);
    expect(pad.state['0,0']).toEqual({ id: 'mosaic', rotation: 0 });
    expect([pad.state['1,0']!.id, pad.state['0,1']!.id]).toEqual([STAIRS_ID, STAIRS_ID]);
  });
});

const flat = (laid: LayoutItem) => ({ item: laid, rotation: 0 as const });

describe('repaves', () => {
  const live = rules({ mosaic: KIT });

  it('lays a mosaic over a plain path', () => {
    expect(repaves(TILES, PATH, flat(item('mosaic-edge')), live)).toBe(true);
  });

  it('lays one mosaic style over another, but never over its own', () => {
    expect(repaves(OTHER, item('mosaic-centre'), flat(OTHER), live)).toBe(true);
    expect(repaves(TILES, item('mosaic-edge'), flat(TILES), live)).toBe(false);
  });

  it('never repaves with the path tool', () => {
    expect(repaves(PATH, TILES, flat(PATH), live)).toBe(false);
    expect(repaves(PATH, PATH, flat(PATH), live)).toBe(false);
  });

  it('never repaves a flight or decking, nor where the ground lays one', () => {
    expect(repaves(TILES, STAIRS, flat(TILES), live)).toBe(false);
    expect(repaves(TILES, BOARDWALK, flat(TILES), live)).toBe(false);
    expect(repaves(TILES, PATH, flat(BOARDWALK), live)).toBe(false);
    expect(repaves(TILES, PATH, { item: STAIRS, rotation: 2 }, live)).toBe(false);
  });
});
