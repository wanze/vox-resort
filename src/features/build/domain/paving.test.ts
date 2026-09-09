import { describe, expect, it } from 'vitest';
import { derivedKey, place, type LayoutItem, type Tile } from '../../layout/domain/resortLayout';
import type { LevelProvider } from '../../layout/domain/elevation';
import { BOARDWALK_ID, PATH_ID, STAIRS_ID } from '../../layout/domain/resortPlan';
import {
  isPaving,
  pavedGroundOf,
  pavingAt,
  relaidBy,
  type PavedGround,
  type PavingRules,
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
  decking: BOARDWALK,
  stairs: STAIRS,
  ...parts,
});

describe('isPaving', () => {
  it('knows the three kinds of paving a path network is laid with', () => {
    expect([PATH, BOARDWALK, STAIRS].map(isPaving)).toEqual([true, true, true]);
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
      [PATH, BOARDWALK, STAIRS],
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
