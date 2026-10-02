import { describe, expect, it } from 'vitest';
import { ORIGINAL_TYPES } from '../../catalog/domain/objectTypes';
import { elevationFor, levelAt, type LevelProvider } from '../../layout/domain/elevation';
import { clampParams, generateResort } from '../../layout/domain/resortGenerator';
import { layoutResort, type LayoutItem } from '../../layout/domain/resortLayout';
import { shoreFor } from '../../layout/domain/shoreline';
import { LEVEL_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { flowFieldFor } from './flowField';

const FLAT: LevelProvider = () => 0;

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

// A terrace one level up north of z = 1, climbed at x = 0 by a flight and at x = 4 by a ramp; the
// lower street runs along z = 3 and the upper one along z = 0.
const terrace = (ramp: boolean): WalkNetwork => {
  const paved: PavedTile[] = [];
  for (let tileX = 0; tileX <= 4; tileX++) {
    paved.push({ tileX, tileZ: 0, y: LEVEL_VOXELS }, { tileX, tileZ: 3, y: 0 });
  }
  paved.push(
    { tileX: 0, tileZ: 2, y: 0, id: 'path', rotation: 0 },
    { tileX: 0, tileZ: 1, y: 0, id: 'stairs', rotation: 0 },
  );
  if (ramp) {
    paved.push(
      { tileX: 4, tileZ: 2, y: 0, id: 'ramp-foot', rotation: 0 },
      { tileX: 4, tileZ: 1, y: 0, id: 'ramp-head', rotation: 0 },
    );
  }
  return walkNetworkFor({
    paved,
    levelOf: (_x, tileZ) => (tileZ < 1 ? 1 : 0),
    shore: null,
    tilesX: 8,
  });
};

const lowest = (network: WalkNetwork, tileX: number, tileZ: number): number =>
  network.nodes.findIndex(
    (node) =>
      node.tileX === tileX &&
      node.tileZ === tileZ &&
      node.y ===
        Math.min(
          ...network.nodes
            .filter((other) => other.tileX === tileX && other.tileZ === tileZ)
            .map((other) => other.y),
        ),
  );

describe('flowFieldFor, step-free', () => {
  it('never climbs a flight', () => {
    const network = terrace(false);
    const field = flowFieldFor(network, [lowest(network, 2, 0)], { stepFree: true });
    expect(field.hops[lowest(network, 2, 3)]).toBe(-1);
    expect(
      flowFieldFor(network, [lowest(network, 2, 0)]).hops[lowest(network, 2, 3)],
    ).toBeGreaterThan(0);
  });

  it('climbs a ramp, the long way round if it must', () => {
    const network = terrace(true);
    const upstairs = lowest(network, 0, 0);
    const stepFree = flowFieldFor(network, [upstairs], { stepFree: true });
    const walking = flowFieldFor(network, [upstairs]);
    const below = lowest(network, 0, 3);
    expect(stepFree.hops[below]).toBeGreaterThan(walking.hops[below]!);
    let at = below;
    const passed = new Set<number>();
    while (stepFree.next[at] !== at) {
      at = stepFree.next[at]!;
      passed.add(network.nodes[at]!.tileX);
    }
    expect(passed.has(4)).toBe(true);
  });
});

describe('the cost of a field on the generated plot', () => {
  const TYPES = ORIGINAL_TYPES.map((type) => ({
    id: type.id,
    tilesX: type.model.tiles.x,
    tilesZ: type.model.tiles.z,
    category: type.category,
    placement: type.model.placement,
  }));
  const ITEMS: LayoutItem[] = ORIGINAL_TYPES.map((type) => ({
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

  it('walks exactly as it did before steps were marked, unless asked to be step-free', () => {
    const unmarked = {
      ...network,
      edges: network.edges.map((edge) => ({ ...edge, stepped: false })),
    };
    expect(flowFieldFor(network, network.gates)).toEqual(flowFieldFor(unmarked, network.gates));
    expect(flowFieldFor(network, network.gates, { stepFree: false })).toEqual(
      flowFieldFor(network, network.gates),
    );
    expect(network.edges.some((edge) => edge.stepped)).toBe(true);
  });

  // A ceiling on the lazy per-venue field design, not a benchmark: the budgets are
  // roughly 40-70x the measured cost so a loaded machine does not turn this red.
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
