import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES } from '../../catalog/domain/objectTypes';
import { elevationFor, levelAt, type LevelProvider } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor } from '../../layout/domain/shoreline';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { flowFieldFor } from './flowField';

const FLAT: LevelProvider = () => 0;

/** A paved street `length` tiles long, running east, as `crowd.test.ts` builds one. */
const street = (length: number): PavedTile[] =>
  Array.from({ length }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));

const networkOf = (paved: PavedTile[]): WalkNetwork =>
  walkNetworkFor({ paved, levelOf: FLAT, shore: null, tilesX: 40 });

const nodeAt = (network: WalkNetwork, tileX: number, tileZ = 0): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

describe('flowFieldFor', () => {
  it('counts the hops out from a source and points every node back at it', () => {
    const network = networkOf(street(5));
    const source = nodeAt(network, 0);
    const field = flowFieldFor(network, [source]);

    for (let tileX = 0; tileX < 5; tileX++) {
      expect(field.hops[nodeAt(network, tileX)], `tile ${tileX}`).toBe(tileX);
    }
    // Following `next` from the far end walks the whole street in four steps.
    let at = nodeAt(network, 4);
    let steps = 0;
    while (field.next[at]! !== at) {
      at = field.next[at]!;
      steps++;
    }
    expect(steps).toBe(4);
    expect(at).toBe(source);
  });

  it('routes every node to its nearer source, and breaks the tie by source order', () => {
    const network = networkOf(street(5));
    const west = nodeAt(network, 0);
    const east = nodeAt(network, 4);
    const field = flowFieldFor(network, [west, east]);

    expect(field.hops[nodeAt(network, 1)]).toBe(1);
    expect(field.hops[nodeAt(network, 3)]).toBe(1);
    expect(field.next[nodeAt(network, 1)]).toBe(west);
    expect(field.next[nodeAt(network, 3)]).toBe(east);
    // Tile 2 is two hops from either end. The sources are seeded in the order
    // they were given, so the sweep reaches it from the first one - which is
    // why `doorsFor` sorts.
    expect(field.hops[nodeAt(network, 2)]).toBe(2);
    expect(field.next[nodeAt(network, 2)]).toBe(nodeAt(network, 1));
  });

  it('leaves a component the source cannot reach at -1 throughout', () => {
    const network = networkOf([
      ...street(3),
      { tileX: 10, tileZ: 0, y: 0 },
      { tileX: 11, tileZ: 0, y: 0 },
    ]);
    const field = flowFieldFor(network, [nodeAt(network, 0)]);
    expect(field.hops[nodeAt(network, 10)]).toBe(-1);
    expect(field.next[nodeAt(network, 10)]).toBe(-1);
    expect(field.hops[nodeAt(network, 11)]).toBe(-1);
  });

  it('gives a venue with no door a field of -1, rather than throwing', () => {
    const network = networkOf(street(4));
    const field = flowFieldFor(network, []);
    expect([...field.next]).toEqual([-1, -1, -1, -1]);
    expect([...field.hops]).toEqual([-1, -1, -1, -1]);
  });

  it('ignores a source that is out of range or named twice', () => {
    const network = networkOf(street(3));
    const source = nodeAt(network, 0);
    const field = flowFieldFor(network, [-1, source, source, 99]);
    expect(field.hops[source]).toBe(0);
    expect(field.hops[nodeAt(network, 2)]).toBe(2);
  });
});

describe('the cost of a field on the generated plot', () => {
  const TYPES = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    category: type.category,
    placement: type.model.placement,
  }));
  const ITEMS: LayoutItem[] = OBJECT_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    width: type.model.width,
    depth: type.model.depth,
    category: type.category,
  }));
  const plan = generateResort(
    TYPES,
    clampParams({ tilesX: 112, tilesZ: 100, seed: 3, density: 0.7 }),
  );
  const layout = layoutResort(ITEMS, plan);
  const elevation = elevationFor(plan);
  const network = walkNetworkFor({
    paved: layout.paths,
    levelOf: (x, z) => levelAt(elevation, x, z),
    shore: shoreFor(plan),
    tilesX: plan.tilesX,
  });

  /**
   * The one wall-clock assertion this feature carries, and it is a **ceiling**
   * rather than a benchmark: `plans/017-goal-directed-routing.md` rests its whole
   * design on one field per venue being cheap enough to build lazily, and a
   * reader who wants to change that should have to move a number here first.
   *
   * Measured at 0.47 ms for one field and 5.82 ms for eighty, over 2 260 nodes.
   * The budgets below are roughly forty and seventy times those, so a loaded
   * machine does not turn this red: they are a ceiling on the design, not a
   * benchmark of the machine.
   */
  it('sweeps the whole graph well inside the budget the design rests on', () => {
    expect(network.nodes.length).toBeGreaterThan(1000);
    const doors = [0, 1, 2];

    const oneStart = performance.now();
    flowFieldFor(network, doors);
    expect(performance.now() - oneStart).toBeLessThan(20);

    const manyStart = performance.now();
    for (let i = 0; i < 80; i++) flowFieldFor(network, [i % network.nodes.length]);
    expect(performance.now() - manyStart).toBeLessThan(400);
  });
});
