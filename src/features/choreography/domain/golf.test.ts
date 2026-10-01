import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, recast, type Cast } from './casting';
import { laneAt } from './golf';
import { placesFor } from './places';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('a round drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const { model } = objectTypeById('minigolf');
const COURSE: Placement = {
  key: 'minigolf#0',
  id: 'minigolf',
  tileX: 0,
  tileZ: 0,
  tilesX: model.tiles.x,
  tilesZ: model.tiles.z,
  rotation: 0,
  x: 0,
  z: 0,
  y: 0,
  width: model.tiles.x * TILE_VOXELS,
  depth: model.tiles.z * TILE_VOXELS,
};

const places = placesFor(venuesOn([COURSE]), new Map([[COURSE.key, COURSE]]), { seats: [] });
const course = places[0]!.golf!;

// The first `count` people at the course, cast as the frame loop casts them: two to a lane.
function golfers(count: number): Cast {
  const cast = createCast(count, places);
  recast(
    cast,
    {
      count,
      venueOf: () => 0,
      isWaiting: () => false,
      queuePlace: () => -1,
      isAsleep: () => false,
      isPresent: () => true,
    },
    new Int32Array(0),
  );
  return cast;
}

const STEP = 0.1;

const striking = (cast: Cast, person: number): boolean =>
  Math.floor(cast.pose[person]!) === DRAWN_POSE.strike;

const distanceToLine = (lane: number, x: number, z: number): number => {
  const { line } = course.lanes[lane]!;
  let nearest = Infinity;
  for (let at = 1; at < line.length; at++) {
    const a = line[at - 1]!;
    const b = line[at]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0), 1);
    nearest = Math.min(nearest, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return nearest;
};

const nearestLane = (x: number, z: number): number => {
  let best = 0;
  for (let lane = 1; lane < course.lanes.length; lane++) {
    if (distanceToLine(lane, x, z) < distanceToLine(best, x, z)) best = lane;
  }
  return best;
};

const shownBalls = (cast: Cast) => cast.golf[0]!.balls.filter((ball) => ball.shown);

describe('playRounds', () => {
  it('takes a party round its lanes in order, a lane a slot', () => {
    const cast = golfers(2);
    const played: number[] = [];
    for (let time = 0; time < course.slot * 4; time += STEP) {
      perform(cast, time);
      const slot = Math.floor(time / course.slot);
      if (!striking(cast, 0) || played.length > slot) continue;
      played.push(nearestLane(cast.x[0]!, cast.z[0]!));
    }
    const expected = [0, 1, 2, 3].map((slot) => laneAt(course, 0, slot));
    expect(played).toEqual(expected);
    expect(new Set(played).size).toBeGreaterThan(1);
  });

  it('lets one member putt at a time, and everybody putt every lane', () => {
    const cast = golfers(4);
    const struck = new Set<number>();
    for (let time = 0; time < course.slot; time += STEP) {
      perform(cast, time);
      for (const pair of [
        [0, 1],
        [2, 3],
      ]) {
        const [a, b] = pair as [number, number];
        expect(striking(cast, a) && striking(cast, b)).toBe(false);
        if (striking(cast, a)) struck.add(a);
        if (striking(cast, b)) struck.add(b);
      }
    }
    expect([...struck].toSorted()).toEqual([0, 1, 2, 3]);
  });

  it('sinks the ball in the cup at the end of every turn', () => {
    const cast = golfers(2);
    const ball = cast.golf[0]!.balls[0]!;
    let sunk = 0;
    let wasSunk = false;
    for (let time = 0; time < course.slot * 2; time += STEP) {
      perform(cast, time);
      const lane = course.lanes[laneAt(course, 0, Math.floor(time / course.slot))]!;
      const isSunk = ball.shown && ball.y < lane.ground;
      if (isSunk) {
        const cup = lane.line.at(-1)!;
        expect(Math.hypot(ball.x - cup.x, ball.z - cup.z)).toBeLessThan(1e-6);
      }
      if (isSunk && !wasSunk) sunk++;
      wasSunk = isSunk;
    }
    expect(sunk).toBe(4);
  });

  it('never walks anybody through a hedge, a landmark or a flag', () => {
    const solid = new Set(model.voxels.map(({ x, y, z }) => `${x},${y},${z}`));
    const cast = golfers(16);
    for (let time = 0; time < course.slot * 2; time += STEP * 3) {
      perform(cast, time);
      for (let person = 0; person < 16; person++) {
        const x = Math.floor(cast.x[person]!);
        const z = Math.floor(cast.z[person]!);
        const feet = cast.y[person]!;
        // Over a lane's kerb or a mound, which a step clears; anything as tall as a knee is not.
        for (const above of [2, 3]) {
          expect(solid.has(`${x},${feet + above},${z}`), `${person} at ${x},${z}, ${time}s`).toBe(
            false,
          );
        }
      }
    }
  });

  it('plays the same round twice from the same clock', () => {
    const a = golfers(16);
    const b = golfers(16);
    for (let time = 0; time < 120; time += 0.7) perform(a, time);
    perform(b, 119.7);
    perform(a, 119.7);
    expect(Array.from(b.x)).toEqual(Array.from(a.x));
    expect(Array.from(b.z)).toEqual(Array.from(a.z));
    expect(Array.from(b.pose)).toEqual(Array.from(a.pose));
    expect(shownBalls(b)).toEqual(shownBalls(a));
    expect(shownBalls(a).length).toBeGreaterThan(0);
  });
});
