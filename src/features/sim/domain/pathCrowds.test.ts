import { describe, expect, it } from 'vitest';
import type { LevelProvider } from '../../layout/domain/elevation';
import { walkNetworkFor, type PavedTile, type WalkNetwork } from '../../crowd/domain/walkNetwork';
import { MIN_SEEN } from '../../overlays/domain/overlays';
import {
  BUSY_SHARE,
  countWalkers,
  createPathCrowds,
  CROWDED_FROM,
  CRUSHED_AT,
  crushedShare,
  crushOf,
  fadePathCrowds,
  sampleCrush,
  worstCrowded,
  type PathCrowds,
} from './pathCrowds';

const FLAT: LevelProvider = () => 0;

const street: PavedTile[] = Array.from({ length: 5 }, (_, tileX) => ({ tileX, tileZ: 0, y: 0 }));
const plaza: PavedTile[] = Array.from({ length: 9 }, (_, at) => ({
  tileX: 20 + (at % 3),
  tileZ: Math.floor(at / 3),
  y: 0,
}));

const network: WalkNetwork = walkNetworkFor({
  paved: [...street, ...plaza],
  levelOf: FLAT,
  shore: null,
  tilesX: 40,
});

const nodeAt = (tileX: number, tileZ: number): number =>
  network.nodes.findIndex((node) => node.tileX === tileX && node.tileZ === tileZ);

const PATH = nodeAt(2, 0);
const CENTRE = nodeAt(21, 1);

const windowOf = (crowds: PathCrowds, node: number): number =>
  crowds.window.start[node + 1]! - crowds.window.start[node]!;

const nobodyHeld = (): boolean => false;

function countAt(nodes: readonly number[], held: (person: number) => boolean = nobodyHeld) {
  const crowds = createPathCrowds(network);
  const present = new Uint8Array(nodes.length).fill(1);
  countWalkers(crowds, Int32Array.from(nodes), present, held);
  return crowds;
}

const six = (node: number): number[] => Array.from({ length: 6 }, () => node);

describe('createPathCrowds', () => {
  it('windows three nodes along a one-wide path and nine on a plaza', () => {
    const crowds = createPathCrowds(network);
    expect(windowOf(crowds, PATH)).toBe(3);
    expect(windowOf(crowds, CENTRE)).toBe(9);
  });
});

describe('countWalkers', () => {
  it('reads six on one tile of a path as denser than six on a plaza, and only that as crowded', () => {
    const crowds = countAt([...six(PATH), ...six(CENTRE)]);
    expect(crowds.density[PATH]).toBeCloseTo(2);
    expect(crowds.density[CENTRE]).toBeCloseTo(6 / 9);
    expect(crowds.density[PATH]).toBeGreaterThan(CROWDED_FROM);
    expect(crowds.density[CENTRE]).toBeLessThan(CROWDED_FROM);
  });

  it('leaves out sleepers, queuers, guests inside, the absent and anybody off the paving', () => {
    const crowds = createPathCrowds(network);
    const node = Int32Array.from([PATH, PATH, PATH, -1, -4]);
    const present = Uint8Array.from([1, 1, 0, 1, 1]);
    countWalkers(crowds, node, present, (person) => person === 1);
    expect(crowds.walkers[PATH]).toBe(1);
    expect([...crowds.walkers].reduce((sum, count) => sum + count, 0)).toBe(1);
  });
});

describe('crushOf', () => {
  it('is nothing up to the threshold, everything from the ceiling, and nothing off the graph', () => {
    const crowds = createPathCrowds(network);
    crowds.density[PATH] = CROWDED_FROM;
    expect(crushOf(crowds, PATH)).toBe(0);
    crowds.density[PATH] = (CROWDED_FROM + CRUSHED_AT) / 2;
    expect(crushOf(crowds, PATH)).toBeCloseTo(0.5);
    crowds.density[PATH] = CRUSHED_AT;
    expect(crushOf(crowds, PATH)).toBe(1);
    crowds.density[PATH] = CRUSHED_AT * 2;
    expect(crushOf(crowds, PATH)).toBe(1);
    expect(crushOf(crowds, -1)).toBe(0);
    expect(crushOf(crowds, network.nodes.length)).toBe(0);
  });
});

describe('the remembered crush', () => {
  it('halves daily, and says nothing of a node seen too seldom', () => {
    const crowds = countAt(six(PATH));
    sampleCrush(crowds);
    expect(crowds.seen[PATH]).toBe(6);
    const felt = crowds.felt[PATH]!;
    expect(felt).toBeGreaterThan(0);
    fadePathCrowds(crowds);
    expect(crowds.seen[PATH]).toBe(3);
    expect(crowds.felt[PATH]).toBeCloseTo(felt / 2);
    expect(crowds.seen[PATH]).toBeLessThan(MIN_SEEN);
    expect(crushedShare(crowds)[PATH]).toBeNaN();
  });

  it('names the funnel, not the plaza', () => {
    const crowds = countAt([...six(CENTRE), ...six(PATH)]);
    sampleCrush(crowds);
    const share = crushedShare(crowds);
    expect(share[CENTRE]).toBe(0);
    const worst = worstCrowded(crowds, network);
    expect(worst).toMatchObject({ tileX: 2, tileZ: 0 });
    expect(worst?.share).toBeCloseTo(share[PATH]!);
  });

  it('passes over a crush on a path hardly anybody walks', () => {
    const crowds = countAt(six(PATH));
    sampleCrush(crowds);
    crowds.seen[CENTRE] = crowds.seen[PATH]! / BUSY_SHARE + 1;
    expect(worstCrowded(crowds, network)).toMatchObject({ tileX: 21, tileZ: 1, share: 0 });
  });

  it('names nothing before anybody has walked', () => {
    expect(worstCrowded(createPathCrowds(network), network)).toBeNull();
  });
});
