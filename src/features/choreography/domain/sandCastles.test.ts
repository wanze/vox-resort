import { describe, expect, it } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { RESTING } from '../../crowd/domain/crowd';
import { sandGridFor, type ObstacleBox } from '../../crowd/domain/sandGrid';
import { BEACH_SURFACE } from '../../crowd/domain/walkNetwork';
import { shoreFor, terrainAt, type Shore } from '../../layout/domain/shoreline';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { createCast, recast, SHOWN, type Casting } from './casting';
import {
  buildAt,
  HOST_SHARE,
  MAX_BUILDERS,
  performOnSand,
  planCastles,
  RING,
  stageAt,
  type Builder,
  type CastleGroup,
} from './sandCastles';
import { performAtSea, SWIM_WINDOW, type SeaShore } from './seaSwim';

const BAY: Shore = shoreFor({
  tilesX: 48,
  tilesZ: 40,
  shore: { inset: 8, beach: 10, wave: 2, seed: 5 },
})!;

const seaWith = (obstacles: readonly ObstacleBox[] = []): SeaShore => ({
  sand: sandGridFor({ shore: BAY, tilesX: BAY.tilesX, obstacles }),
  swim: { shore: BAY },
});

const SEA = seaWith();
const tile = (at: number): number => Math.floor(at / TILE_VOXELS);
const PITCH_Z = 26 * TILE_VOXELS;
const STAGES = 4;

const builder = (person: number, x: number, child = true, party = -1): Builder => ({
  person,
  x,
  z: PITCH_Z,
  child,
  onLounger: false,
  party,
  ticksLeft: Infinity,
});

const row = (count: number, child = true): Builder[] =>
  Array.from({ length: count }, (_, person) =>
    builder(person, (4.5 + (person % 40)) * TILE_VOXELS, child),
  );

const plan = (candidates: readonly Builder[], sea = SEA, window = 0, clock = 0) =>
  planCastles(sea, candidates, candidates, window, clock, 12);

function firstHost(sea = SEA): { host: Builder; group: CastleGroup } {
  for (let person = 0; person < 200; person++) {
    const host = builder(person, 10.5 * TILE_VOXELS);
    const [group] = plan([host], sea);
    if (group) return { host, group };
  }
  throw new Error('nobody built');
}

const drawn = (count = 1) => ({
  x: new Float32Array(count),
  y: new Float32Array(count),
  z: new Float32Array(count),
  heading: new Float32Array(count),
  pose: new Float32Array(count),
});

describe('planCastles', () => {
  it('builds between the pitch and the water, on the sand', () => {
    let built = 0;
    for (let window = 0; window < 8; window++) {
      for (const group of plan(row(40), SEA, window, window * SWIM_WINDOW)) {
        built++;
        expect(terrainAt(BAY, tile(group.x), tile(group.z))).toBe('beach');
        expect(group.z).toBeGreaterThan(PITCH_Z);
        expect(group.start).toBeGreaterThanOrEqual(window * SWIM_WINDOW);
        expect(group.gone).toBeLessThanOrEqual((window + 1) * SWIM_WINDOW);
      }
    }
    expect(built).toBeGreaterThan(10);
  });

  it('is started by about the share of children, and never by an adult', () => {
    let hosts = 0;
    let tried = 0;
    for (let person = 0; person < 2000; person++) {
      const x = (4.5 + (person % 40)) * TILE_VOXELS;
      tried++;
      if (plan([builder(person, x)]).length > 0) hosts++;
      expect(plan([builder(person, x, false)])).toEqual([]);
    }
    // A few spots have no room, the rest hold the share.
    expect(hosts / tried).toBeGreaterThan(HOST_SHARE * 0.8);
    expect(hosts / tried).toBeLessThan(HOST_SHARE * 1.1);
  });

  it('gathers nearby children and at most one adult of the host’s own party', () => {
    let gathered = 0;
    let joined = 0;
    for (let person = 0; person < 400; person += 8) {
      const x = 10.5 * TILE_VOXELS;
      const party = [
        builder(person, x, true, 1),
        builder(person + 1, x + 5, true, 2),
        builder(person + 2, x - 5, false, 1),
        builder(person + 3, x + 10, false, 1),
        builder(person + 4, x - 10, false, 3),
        builder(person + 5, x + 15, true, 4),
      ];
      // Pitches are given apart, so the castle has room among them.
      const [group] = planCastles(SEA, party, [], 0, 0, 12);
      if (!group) continue;
      gathered++;
      const [host, ...rest] = [...group.builders].map((member) => party[member - person]!);
      expect(host!.child).toBe(true);
      expect(group.builders.length).toBeLessThanOrEqual(MAX_BUILDERS);
      const adults = rest.filter((member) => !member.child);
      expect(adults.length).toBeLessThanOrEqual(1);
      for (const adult of adults) expect(adult.party).toBe(host!.party);
      joined += rest.length;
    }
    expect(gathered).toBeGreaterThan(0);
    expect(joined).toBeGreaterThan(0);
  });

  it('keeps clear of everybody else’s pitch and of the other castles', () => {
    const candidates = row(40);
    const groups = plan(candidates);
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      for (const other of candidates) {
        expect(Math.hypot(other.x - group.x, other.z - group.z)).toBeGreaterThan(RING + 1.5);
      }
      for (const other of groups) {
        if (other === group) continue;
        expect(Math.hypot(other.x - group.x, other.z - group.z)).toBeGreaterThan(2 * RING);
      }
    }
  });

  it('builds nothing where something stands between the pitch and the sea', () => {
    const { host } = firstHost();
    const wall: ObstacleBox = { x: 0, z: PITCH_Z + 3, width: 48 * TILE_VOXELS, depth: 2 };
    expect(plan([host], seaWith([wall]))).toEqual([]);
  });

  it('leaves out whoever is due off the beach before the walk back', () => {
    const { host } = firstHost();
    expect(plan([{ ...host, ticksLeft: 5 }])).toEqual([]);
  });

  it('plans the same castle every time', () => {
    const { host, group } = firstHost();
    expect(plan([host])).toEqual([group]);
  });
});

describe('buildAt and stageAt', () => {
  it('walks to the ring, kneels facing the castle to dig, and walks back to the pitch', () => {
    const { host, group } = firstHost();
    const into = drawn();
    expect(buildAt(group, 0, group.start - 0.1, into, 0)).toBe(false);
    expect(buildAt(group, 0, group.start, into, 0)).toBe(true);
    expect([into.x[0], into.z[0], into.pose[0]]).toEqual([host.x, host.z, RESTING.none]);

    const digging = (group.begun + group.built) / 2;
    expect(buildAt(group, 0, digging, into, 0)).toBe(true);
    expect(Math.hypot(into.x[0]! - group.x, into.z[0]! - group.z)).toBeCloseTo(RING, 4);
    expect(into.y[0]).toBeLessThan(BEACH_SURFACE);
    expect(Math.floor(into.pose[0]!)).toBe(DRAWN_POSE.strike);
    const facing = Math.atan2(group.x - into.x[0]!, group.z - into.z[0]!);
    expect(into.heading[0]).toBeCloseTo(facing, 4);

    const walk = group.begun - group.start;
    expect(buildAt(group, 0, group.built + walk - 1e-6, into, 0)).toBe(true);
    expect(into.x[0]).toBeCloseTo(host.x, 2);
    expect(into.z[0]).toBeCloseTo(host.z, 2);
    expect(buildAt(group, 0, group.built + walk, into, 0)).toBe(false);
  });

  it('grows the castle through its stages, then lets it slump and go', () => {
    const { group } = firstHost();
    expect(stageAt(group, group.begun - 0.1, STAGES)).toBe(-1);
    expect(stageAt(group, group.begun, STAGES)).toBe(0);
    let last = 0;
    for (let time = group.begun; time < group.built; time += 1) {
      const stage = stageAt(group, time, STAGES);
      expect(stage).toBeGreaterThanOrEqual(last);
      last = stage;
    }
    expect(last).toBe(STAGES - 1);
    expect(stageAt(group, group.built, STAGES)).toBe(STAGES - 1);
    let slumped = STAGES - 1;
    for (let time = group.built; time < group.gone; time += 0.5) {
      const stage = stageAt(group, time, STAGES);
      expect(stage).toBeLessThanOrEqual(slumped);
      slumped = stage;
    }
    expect(slumped).toBe(0);
    expect(stageAt(group, group.gone, STAGES)).toBe(-1);
  });
});

// The beach is the router's, past the resort's own venues: here there are none, so it is 0.
function beachWorld(people: readonly Builder[]) {
  const count = people.length;
  const until = new Float64Array(count).fill(Infinity);
  const crowd = {
    x: Float32Array.from(people, (person) => person.x),
    z: Float32Array.from(people, (person) => person.z),
    seat: new Int32Array(count).fill(-1),
  };
  const casting: Casting = {
    count,
    venueOf: () => 0,
    isWaiting: () => false,
    queuePlace: () => -1,
    isAsleep: () => false,
    isPresent: () => true,
    isChild: (person) => people[person]!.child,
    bathing: { restingUntil: (person) => until[person]!, crowd },
  };
  return { until, casting };
}

describe('performOnSand', () => {
  it('draws the builders at it and the castle at its stage, and nobody once they stop resting', () => {
    const people = row(40);
    const { until, casting } = beachWorld(people);
    const cast = createCast(people.length, [], SEA);
    recast(cast, casting, new Int32Array(0));
    performAtSea(cast, 0, 0);
    performOnSand(cast, 0, 0);
    const group = cast.castles.groups[0]!;
    expect(group).toBeDefined();
    const digging = (group.begun + group.built) / 2;
    performAtSea(cast, digging, 0);
    performOnSand(cast, digging, 0);
    for (const person of group.builders) expect(cast.shown[person]).toBe(SHOWN.placed);
    const shown = cast.castles.stages[0]!.filter((ball) => ball.shown);
    expect(shown).toHaveLength(1);
    expect([shown[0]!.x, shown[0]!.z]).toEqual([group.x, group.z]);
    expect(cast.played.filter(({ ball }) => ball.shown).length).toBeGreaterThanOrEqual(1);

    const person = group.builders[0]!;
    until[person] = Number.NaN;
    recast(cast, casting, new Int32Array(0));
    performAtSea(cast, digging, 0);
    performOnSand(cast, digging, 0);
    expect(cast.shown[person]).toBe(SHOWN.asCrowd);
  });

  it('never takes a swimmer to build', () => {
    const people = row(40);
    const { casting } = beachWorld(people);
    const cast = createCast(people.length, [], SEA);
    recast(cast, casting, new Int32Array(0));
    performAtSea(cast, 0, 0);
    performOnSand(cast, 0, 0);
    for (const group of cast.castles.groups) {
      for (const person of group.builders) expect(cast.bathers.trips[person]).toBeNull();
    }
  });
});
