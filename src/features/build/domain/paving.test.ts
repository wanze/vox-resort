import { describe, expect, it } from 'vitest';
import { derivedKey, place, type LayoutItem, type Tile } from '../../layout/domain/resortLayout';
import type { LevelProvider } from '../../layout/domain/elevation';
import {
  BOARDWALK_ID,
  BRIDGE_ID,
  BRIDGE_RAMP_ID,
  JETTY_ID,
  PATH_ID,
  STAIRS_ID,
} from '../../layout/domain/resortPlan';
import {
  isPaving,
  pavedGroundOf,
  pavingAt,
  relaidBy,
  standsOn,
  unlaidBy,
  type PavedGround,
  type PavingRules,
  type Relaid,
} from './paving';
import { createTileOccupancy } from './tileOccupancy';

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
const JETTY = item(JETTY_ID);
const BRIDGE = item(BRIDGE_ID);
const BRIDGE_RAMP = item(BRIDGE_RAMP_ID);
const COTTAGE = item('cottage', 2, 3);

/** A plot where everything north of `z` stands one level up. */
const benchAt =
  (z: number): LevelProvider =>
  (_x, tileZ) =>
    tileZ < z ? 1 : 0;

/** Paving laid on the listed tiles, everything else bare ground. */
const paved =
  (table: Record<string, LayoutItem>): PavedGround =>
  (tileX, tileZ) =>
    table[`${tileX},${tileZ}`] ?? null;

/** Grass at sea level with nothing paved on it, and the whole catalogue to hand. */
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
  flagstones: PATH,
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
    // Every tile of the cottage, not just the one it is keyed on.
    expect(ground()(4, 4)).toBeNull();
    expect(ground()(5, 6)).toBeNull();
  });
});

describe('pavingAt', () => {
  it('lays the paving as picked on level ground', () => {
    expect(pavingAt(PATH, { x: 2, z: 2 }, 0, rules())).toEqual({ item: PATH, rotation: 0 });
  });

  it('lays a flight where the tile climbs to paving one level up', () => {
    // Drawing downhill: the tile above the step is already paved, so this tile
    // is the lower one and comes out as the flight, facing north at it.
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
    // The higher ground is a lawn: a flight ending in one reads as a mistake.
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
    // A terrace anchored at the sand edge puts the lower tile of its step on the
    // landward-most row of sand: there you climb off the beach, you do not walk
    // up decking laid flat against a step.
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
    // A slab has no front, so its turn is the ground's to give — and only a
    // flight's climb has anything to say about it.
    expect(pavingAt(PATH, { x: 2, z: 2 }, 3, rules()).rotation).toBe(0);
    expect(pavingAt(PATH, { x: 2, z: 9 }, 3, rules({ isSand: () => true }))).toEqual({
      item: BOARDWALK,
      rotation: 0,
    });
  });

  it('stands a building on a step as picked, turn and all, so only paving climbs', () => {
    // A cottage next to higher paved ground is a cottage, refused or not by the
    // rule that an object stands on one level; it is not a staircase.
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
    // Drawing uphill: the slab at 0,1 went down before there was anything above
    // it to climb to, and paving 0,0 is what makes it a flight.
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
    // Paving the lower tile of a step re-lays nothing: the tile itself is
    // `pavingAt`'s answer, and a flight never goes on the upper tile.
    const relaid = relaidBy(
      { x: 0, z: 1 },
      rules({ pavedWith: paved({ '0,0': PATH, '0,1': PATH }), levelOf: benchAt(1) }),
    );
    expect(relaid).toEqual([]);
  });

  it('leaves a tile that is already a flight as it stands', () => {
    // Re-facing one would only move the fudge an L-bend was resolved with.
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
    // A tile on the bench with paving below it on two sides: both climb to it.
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
    // Each faces the tile that was just paved: north from the south, west from
    // the east.
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

/** What was laid, in the terms the assertions are written in. */
const laidOf = (relaid: readonly Relaid[]) =>
  relaid.map(({ placement }) => ({
    id: placement.id,
    x: placement.tileX,
    z: placement.tileZ,
    rotation: placement.rotation,
  }));

describe('unlaidBy', () => {
  it('lays a flight flat again once the tile it climbed to is taken up', () => {
    // The flight at 0,1 climbed to 0,0, and 0,0 is gone.
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
    // An L-bend: the flight at 1,1 had paving above it to the north and to the
    // west. The northern tile is taken up, so it faces west now.
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
    // The ramp at 2,5 came ashore at 2,4; with the bank gone it is deck again.
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
    // Pave the top of a step, then take it up again: the flight it made goes
    // back to the slab it was.
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
    // Paving one level up beside it would be a flight anywhere else; out on the
    // water there is nothing to climb and the pier answer comes first.
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
  /** Water the sea does not own: a channel cut through the middle of the plot. */
  const river = rules({ isWater: (_x, tileZ) => tileZ === 5, isSea: () => false });

  /** A channel two rows across, with the street either side of it already laid. */
  const crossing = rules({
    isWater: (_x, tileZ) => tileZ === 5 || tileZ === 6,
    isSea: () => false,
    pavedWith: (tileX, tileZ) => (tileX === 2 && (tileZ === 4 || tileZ === 7) ? PATH : null),
  });

  it('lays a bridge rather than a pier, which is the one thing they differ on', () => {
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, river).item).toBe(BRIDGE);
  });

  it('lays the deck unturned where the crossing has no shape yet', () => {
    // Nothing paved around it: a tile of water on its own is the middle of a
    // span that has not been drawn, and nothing says which way it runs.
    expect(pavingAt(PATH, { x: 2, z: 5 }, 0, river)).toEqual({ item: BRIDGE, rotation: 0 });
  });

  it('brings the tile beside a bank ashore, turned to face it', () => {
    // Unturned a ramp comes ashore to the north, so the tile at z = 5 with the
    // street at z = 4 is laid unturned and the one at z = 6 is turned about.
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
    // A tile of water drawn before the bank it adjoins goes down as a deck —
    // there is nothing yet to come ashore at. Paving the bank is what turns it
    // into the ramp, and `relaidBy` is what takes the deck back up. That is the
    // ordinary case and not an odd one: a stroke crossing a river paves the far
    // bank *after* the last tile of water. See `paving.ts`.
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
    // A hedge or a cottage changes neither answer, so a placement that is not
    // paving never disturbs the span next to it.
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
    // Grass to row 1, sand from row 2, the sea from row 5.
    const beach = rules({
      isWater: (_x, tileZ) => tileZ >= 5,
      isSea: (_x, tileZ) => tileZ >= 5,
      isSand: (_x, tileZ) => tileZ >= 2 && tileZ < 5,
    });
    const parasol = { ...item('beach-umbrella'), ground: 'beach' as const };
    const hut = { ...item('pedalo-rental', 2, 2), ground: 'shore' as const };
    expect(standsOn(parasol, { x: 0, z: 1 }, beach)).toBe(false);
    expect(standsOn(parasol, { x: 0, z: 2 }, beach)).toBe(true);
    expect(standsOn(parasol, { x: 0, z: 5 }, beach)).toBe(false);
    expect(standsOn(hut, { x: 0, z: 2 }, beach)).toBe(true);
    expect(standsOn(hut, { x: 0, z: 4 }, beach)).toBe(true);
    expect(standsOn(COTTAGE, { x: 0, z: 1 }, beach)).toBe(true);
  });
});
