import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotateExtent, type Rotation } from '../../layout/domain/rotation';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import { perform } from './acts';
import { createCast, recast, SHOWN, type Cast, type Casting } from './casting';
import { placesFor } from './places';

// Drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('a court drew from a seeded stream');
  const refuse = (): never => {
    throw refused;
  };
  return { createRandom: refuse, resumeRandom: refuse };
});

const placed = (id: string, rotation: Rotation = 0): Placement => {
  const { model } = objectTypeById(id);
  const tiles = rotateExtent(model.tiles.x, model.tiles.z, rotation);
  return {
    key: `${id}#0`,
    id,
    tileX: 2,
    tileZ: 3,
    tilesX: tiles.x,
    tilesZ: tiles.z,
    rotation,
    x: 2 * TILE_VOXELS,
    z: 3 * TILE_VOXELS,
    y: 0,
    width: tiles.x * TILE_VOXELS,
    depth: tiles.z * TILE_VOXELS,
  };
};

const placesAt = (id: string, rotation: Rotation = 0) => {
  const placement = placed(id, rotation);
  return placesFor(venuesOn([placement]), new Map([[placement.key, placement]]), { seats: [] });
};

// The first `players` people play and the next `watchers` wait their turn; `away` are not there.
function courtside(id: string, players: number, watchers: number, rotation: Rotation = 0) {
  const count = players + watchers + 2;
  const cast = createCast(count, placesAt(id, rotation));
  const away = new Set([players + watchers, players + watchers + 1]);
  const casting: Casting = {
    count,
    venueOf: () => 0,
    isWaiting: (person) => person >= players && person < players + watchers,
    queuePlace: (person) => person - players,
    isAsleep: () => false,
    isPresent: (person) => !away.has(person),
  };
  const recastNow = () => recast(cast, casting, new Int32Array(0));
  recastNow();
  return { cast, away, recastNow, latecomer: players + watchers };
}

const FRAME = 1 / 60;

const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

const watchersOf = (cast: Cast): number[] =>
  [...cast.courts[0]!.watchers].map((index) => cast.heldBy[index]!).filter((person) => person >= 0);

const placeOf = (cast: Cast, person: number) => cast.places[cast.placeOf[person]!]!;

describe('playGames', () => {
  it('plays a rally with whoever is on court, the ball drawn with it', () => {
    const { cast } = courtside('tennis-court', 2, 0);
    const poses = new Set<number>();
    const start = { x: cast.x[0]!, z: cast.z[0]! };
    let moved = 0;
    for (let time = 0; time < 12; time += FRAME) {
      perform(cast, time);
      expect(cast.courts[0]!.ball.shown).toBe(true);
      for (const person of [0, 1]) {
        expect(cast.shown[person]).toBe(SHOWN.placed);
        poses.add(Math.floor(cast.pose[person]!));
      }
      moved = Math.max(moved, Math.hypot(cast.x[0]! - start.x, cast.z[0]! - start.z));
    }
    expect(moved).toBeGreaterThan(3);
    expect(poses).toContain(DRAWN_POSE.jog);
    expect(poses).toContain(DRAWN_POSE.strike);
  });

  it('turns the watchers to the ball, never further than they can turn', () => {
    for (const rotation of [0, 1] as const) {
      const { cast } = courtside('tennis-court', 2, 8, rotation);
      const court = cast.courts[0]!;
      let frames = 0;
      let following = 0;
      for (let time = 0; time < 30; time += FRAME) {
        perform(cast, time);
        for (const person of watchersOf(cast)) {
          const facing = placeOf(cast, person).heading;
          const off = wrap(cast.heading[person]! - facing);
          expect(Math.abs(off)).toBeLessThanOrEqual(1.4 + 1e-6);
          const { ball } = court;
          const bearing = wrap(
            Math.atan2(ball.x - cast.x[person]!, ball.z - cast.z[person]!) - facing,
          );
          const wanted = Math.min(Math.max(bearing, -1.4), 1.4);
          frames++;
          if (Math.abs(wrap(off - wanted)) < 0.3) following++;
        }
      }
      expect(following / frames).toBeGreaterThan(0.75);
    }
  });

  it('leaves a court nobody plays on still, its watchers facing the court', () => {
    const { cast } = courtside('basketball-court', 0, 6);
    expect(watchersOf(cast)).toHaveLength(6);
    for (let time = 0; time < 10; time += FRAME) {
      perform(cast, time);
      expect(cast.courts[0]!.ball.shown).toBe(false);
      expect(cast.courts[0]!.rally).toBe(-1);
      for (const person of watchersOf(cast)) {
        expect(cast.heading[person]).toBeCloseTo(placeOf(cast, person).heading, 6);
        expect(cast.pose[person]).toBe(placeOf(cast, person).pose);
      }
    }
  });

  it('cheers each point in the pause after it, with about half the watchers', () => {
    const { cast } = courtside('volleyball', 4, 12);
    const court = cast.courts[0]!;
    let pauses = 0;
    for (let time = 0; time < 120; time += FRAME) {
      perform(cast, time);
      const cheering = watchersOf(cast).filter(
        (person) => cast.pose[person] === DRAWN_POSE.cheer,
      ).length;
      const over = time - court.start >= court.state.over;
      if (!over) expect(cheering).toBe(0);
      else {
        pauses++;
        expect(cheering).toBeGreaterThan(1);
        expect(cheering).toBeLessThan(11);
      }
    }
    expect(pauses).toBeGreaterThan(0);
  });

  it('has a player cast mid-rally join at the next rally', () => {
    const { cast, away, recastNow, latecomer } = courtside('tennis-court', 2, 0);
    const court = cast.courts[0]!;
    for (let time = 0; time < 3; time += FRAME) perform(cast, time);
    away.delete(latecomer);
    recastNow();
    expect(cast.shown[latecomer]).toBe(SHOWN.placed);
    const at = { x: cast.x[latecomer]!, z: cast.z[latecomer]! };
    const rally = court.rally;
    let time = 3;
    for (; court.rally === rally; time += FRAME) {
      perform(cast, time);
      if (court.rally !== rally) break;
      expect(cast.x[latecomer]).toBe(at.x);
      expect(cast.z[latecomer]).toBe(at.z);
    }
    for (const end = time + 5; time < end; time += FRAME) perform(cast, time);
    expect(Math.hypot(cast.x[latecomer]! - at.x, cast.z[latecomer]! - at.z)).toBeGreaterThan(2);
  });

  it('breaks a rally off when a player walks away, the ball dropping where it was', () => {
    const { cast, away, recastNow } = courtside('tennis-court', 2, 0);
    const court = cast.courts[0]!;
    for (let time = 0; time < 4; time += FRAME) perform(cast, time);
    const rally = court.rally;
    away.add(1);
    recastNow();
    let time = 4;
    for (; time < 4.5; time += FRAME) perform(cast, time);
    expect(court.rally).toBe(rally);
    expect(court.ball.y).toBe(court.game.frame.ground);
    for (; time < 6; time += FRAME) perform(cast, time);
    expect(court.rally).toBeGreaterThan(rally);
  });
});
