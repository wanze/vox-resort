import { describe, expect, it, vi } from 'vitest';
import { TILE_VOXELS } from '../../../../voxel-gen/voxelgen.ts';
import { objectTypeById } from '../../catalog/domain/objectTypes';
import { WALK_SPEED } from '../../crowd/domain/crowd';
import type { Placement } from '../../layout/domain/resortLayout';
import { rotateExtent, type Rotation } from '../../layout/domain/rotation';
import { DRAWN_POSE } from '../../rendering/domain/poses';
import { venuesOn } from '../../sim/domain/venues';
import {
  basketballAt,
  createGameState,
  createLineup,
  gameAt,
  tennisAt,
  volleyballAt,
  type Game,
  type GameState,
  type Lineup,
} from './games';
import { placesFor } from './places';

// Games are drawn only: a seeded draw here would move every replay of the simulation.
vi.mock('../../layout/domain/random', () => {
  const refused = new Error('a game drew from a seeded stream');
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

const gameOf = (id: string, rotation: Rotation = 0): Game => {
  const placement = placed(id, rotation);
  const venues = venuesOn([placement]);
  return placesFor(venues, new Map([[placement.key, placement]]), { seats: [] })[0]!.game!;
};

// Everybody named plays, starting where the art stands them.
function lineupOf(game: Game, slots: readonly number[]): Lineup {
  const lineup = createLineup(game.players.length);
  for (const slot of slots) lineup.playing[slot] = 1;
  for (const [slot, player] of game.players.entries()) {
    lineup.u[slot] = player.u;
    lineup.v[slot] = player.v;
  }
  return lineup;
}

type Play = (game: Game, lineup: Lineup, rally: number, time: number, into: GameState) => GameState;

const STEP = 1 / 240;
const RALLIES = 10;

const overOf = (play: Play, game: Game, lineup: Lineup, rally: number): number =>
  play(game, lineup, rally, Infinity, createGameState(game.players.length)).over;

// Each frame of a rally, from its start to a second past the point.
function sample(
  play: Play,
  game: Game,
  lineup: Lineup,
  rally: number,
  look: (state: GameState, time: number) => void,
): void {
  const end = overOf(play, game, lineup, rally) + 1;
  const state = createGameState(game.players.length);
  for (let time = 0; time <= end; time += STEP) look(play(game, lineup, rally, time, state), time);
}

const playingIn = (lineup: Lineup): number[] =>
  [...lineup.playing.keys()].filter((slot) => lineup.playing[slot] === 1);

const codeOf = (pose: number): number => Math.floor(pose);
const progressOf = (pose: number): number => pose - Math.floor(pose);

const netOf = (game: Game) => game.court.net!;

// Each time the ball passes over the net, how high its underside was. A step that jumps is a
// fresh ball from practice's basket, not a pass.
function overTheNet(play: Play, game: Game, lineup: Lineup, rally: number): number[] {
  const net = netOf(game);
  const heights: number[] = [];
  const before = { u: Number.NaN, y: Number.NaN };
  sample(play, game, lineup, rally, (state) => {
    const crosses = (before.u - net.u) * (state.ballU - net.u) < 0;
    if (crosses && Math.abs(before.u - state.ballU) < 2) {
      heights.push(Math.min(before.y, state.ballY));
    }
    before.u = state.ballU;
    before.y = state.ballY;
  });
  return heights;
}

// Where the ball touched the court before the point was won, by the lowest frames.
function bounces(play: Play, game: Game, lineup: Lineup, rally: number) {
  const over = overOf(play, game, lineup, rally);
  const frames: { u: number; v: number; y: number; time: number }[] = [];
  sample(play, game, lineup, rally, (state, time) => {
    if (!state.ballHeld) frames.push({ u: state.ballU, v: state.ballV, y: state.ballY, time });
  });
  return frames.filter(
    (frame, at) =>
      at > 0 &&
      at < frames.length - 1 &&
      frame.time < over - 0.05 &&
      frame.y < 0.5 &&
      frame.y <= frames[at - 1]!.y &&
      frame.y <= frames[at + 1]!.y,
  );
}

const sideSignOf = (game: Game, side: 0 | 1): number => {
  const middle = game.court.net?.u ?? 0;
  const player = game.players.find((p) => p.side === side)!;
  return Math.sign(player.u - middle);
};

describe('tennis', () => {
  const game = gameOf('tennis-court');
  const singles = lineupOf(game, [0, 1]);
  const doubles = lineupOf(game, [0, 1, 2, 3]);

  it('sends the ball over the net at every exchange, above its top', () => {
    for (const lineup of [singles, doubles, lineupOf(game, [1])]) {
      for (let rally = 0; rally < RALLIES; rally++) {
        const heights = overTheNet(tennisAt, game, lineup, rally);
        expect(heights.length).toBeGreaterThan(0);
        for (const height of heights) expect(height).toBeGreaterThan(netOf(game).top + 1);
      }
    }
  });

  it('bounces inside the lines, the serve in the service box across from the server', () => {
    const { halfLength, halfWidth } = game.court;
    const net = netOf(game);
    for (const lineup of [singles, doubles]) {
      for (let rally = 0; rally < RALLIES; rally++) {
        const all = bounces(tennisAt, game, lineup, rally);
        expect(all.length, `rally ${rally}`).toBeGreaterThan(0);
        for (const { u, v } of all) {
          expect(Math.abs(u)).toBeLessThanOrEqual(halfLength + 0.5);
          expect(Math.abs(v)).toBeLessThanOrEqual(halfWidth + 0.5);
        }
        const serve = all[0]!;
        const server = (game.salt + rally) % 2;
        const receives = sideSignOf(game, server === 0 ? 1 : 0);
        expect(Math.sign(serve.u - net.u)).toBe(receives);
        expect(Math.abs(serve.u - net.u)).toBeLessThanOrEqual(halfLength * 0.55 + 0.5);
        expect(Math.abs(serve.v)).toBeLessThanOrEqual(halfWidth - 5 + 0.5);
      }
    }
  });

  it('has the hitter halfway through the stroke as the ball reaches them', () => {
    for (const lineup of [singles, doubles]) {
      let strokes = 0;
      for (let rally = 0; rally < RALLIES; rally++) {
        sample(tennisAt, game, lineup, rally, (state) => {
          for (const slot of playingIn(lineup)) {
            const pose = state.pose[slot]!;
            if (codeOf(pose) !== DRAWN_POSE.strike) continue;
            if (Math.abs(progressOf(pose) - 0.5) > STEP / 0.6 / 2 + 1e-9) continue;
            strokes++;
            const far = Math.hypot(state.ballU - state.u[slot]!, state.ballV - state.v[slot]!);
            expect(far).toBeLessThan(2);
          }
        });
      }
      expect(strokes).toBeGreaterThan(RALLIES * 2);
    }
  });

  it('plays singles with three, the third waiting by the net post, and doubles with four', () => {
    const three = lineupOf(game, [0, 1, 2]);
    const struck = new Set<number>();
    for (let rally = 0; rally < RALLIES; rally++) {
      sample(tennisAt, game, three, rally, (state, time) => {
        if (codeOf(state.pose[2]!) === DRAWN_POSE.strike) struck.add(rally);
        if (time < 5) return;
        expect(Math.abs(state.v[2]!)).toBeGreaterThan(game.court.halfWidth);
        expect(Math.abs(state.u[2]! - netOf(game).u)).toBeLessThan(4);
      });
    }
    expect(struck.size).toBe(0);
    const volleyed = new Set<number>();
    for (let rally = 0; rally < RALLIES; rally++) {
      sample(tennisAt, game, doubles, rally, (state) => {
        for (const slot of [2, 3]) {
          if (codeOf(state.pose[slot]!) === DRAWN_POSE.strike) volleyed.add(slot);
        }
      });
    }
    expect([...volleyed].toSorted()).toEqual([2, 3]);
  });

  it('has a lone player serve into the far court, every ball rolling on to the back', () => {
    const net = netOf(game);
    for (const slot of [0, 1]) {
      const lone = lineupOf(game, [slot]);
      const far = -sideSignOf(game, game.players[slot]!.side);
      for (let rally = 0; rally < RALLIES; rally++) {
        const first = bounces(tennisAt, game, lone, rally)[0]!;
        expect(Math.sign(first.u - net.u)).toBe(far);
        expect(Math.abs(first.u - net.u)).toBeLessThanOrEqual(game.court.halfLength * 0.55 + 0.5);
        const over = overOf(tennisAt, game, lone, rally);
        const state = tennisAt(game, lone, rally, over, createGameState(game.players.length));
        expect(Math.sign(state.ballU)).toBe(far);
        expect(Math.abs(state.ballU)).toBeGreaterThan(game.court.halfLength + 4);
        expect(state.ballY).toBe(0);
      }
    }
  });
});

describe('basketball', () => {
  const game = gameOf('basketball-court');
  const hoops = game.court.hoops.toSorted((a, b) => a.u - b.u);
  const low = hoops[0]!;
  const high = hoops[1]!;
  // Slots alternate halves: 0, 2, 4 on side 0 and 1, 3, 5 on side 1.
  const shootAround = lineupOf(game, [0, 2, 1]);
  const teams = lineupOf(game, [0, 1, 2, 3, 4, 5]);

  // Each time the ball comes down past the ring's height, the nearest hoop and how far.
  function landings(lineup: Lineup, rally: number) {
    const found: { hoop: typeof low; far: number }[] = [];
    let before = 0;
    sample(basketballAt, game, lineup, rally, (state) => {
      const at = low.y + 1.25;
      if (!state.ballHeld && before >= at && state.ballY < at) {
        const [hoop, far] = [low, high]
          .map((h) => [h, Math.hypot(state.ballU - h.u, state.ballV - h.v)] as const)
          .toSorted((a, b) => a[1] - b[1])[0]!;
        found.push({ hoop, far });
      }
      before = state.ballY;
    });
    return found;
  }

  it('ends every shot at a hoop', () => {
    for (const lineup of [shootAround, teams, lineupOf(game, [3])]) {
      for (let rally = 0; rally < RALLIES; rally++) {
        const shots = landings(lineup, rally);
        expect(shots.length).toBeGreaterThan(0);
        for (const { far } of shots) expect(far).toBeLessThan(1);
      }
    }
  });

  it('shoots around at the hoop nearer most of the players', () => {
    for (let rally = 0; rally < RALLIES; rally++) {
      for (const { hoop } of landings(shootAround, rally)) expect(hoop).toBe(low);
      for (const { hoop } of landings(lineupOf(game, [1, 3, 0]), rally)) expect(hoop).toBe(high);
    }
  });

  it('plays two teams in one half, swapping halves after each shot', () => {
    const halves: number[] = [];
    for (let rally = 0; rally < RALLIES; rally++) {
      const shots = landings(teams, rally);
      expect(shots).toHaveLength(1);
      halves.push(Math.sign(shots[0]!.hoop.u));
      const state = basketballAt(game, teams, rally, 5, createGameState(game.players.length));
      for (const slot of playingIn(teams)) expect(Math.sign(state.u[slot]!)).toBe(halves.at(-1));
    }
    for (let rally = 1; rally < RALLIES; rally++) expect(halves[rally]).toBe(-halves[rally - 1]!);
  });

  it('keeps the ball in somebody’s hands or in the air, never lying still', () => {
    for (const lineup of [shootAround, teams]) {
      for (let rally = 0; rally < RALLIES; rally++) {
        let before: { u: number; v: number; y: number } | null = null;
        sample(basketballAt, game, lineup, rally, (state) => {
          if (state.ballHeld) {
            const nearest = Math.min(
              ...playingIn(lineup).map((slot) =>
                Math.hypot(state.ballU - state.u[slot]!, state.ballV - state.v[slot]!),
              ),
            );
            expect(nearest).toBeLessThan(1.5);
          } else if (before) {
            const moved = Math.hypot(
              state.ballU - before.u,
              state.ballV - before.v,
              state.ballY - before.y,
            );
            expect(moved).toBeGreaterThan(0);
          }
          before = { u: state.ballU, v: state.ballV, y: state.ballY };
        });
      }
    }
  });
});

describe('volleyball', () => {
  const game = gameOf('volleyball');
  const full = lineupOf(game, [...game.players.keys()]);
  const pairs = lineupOf(game, [0, 1, 2, 3]);

  const CONTACT: ReadonlyMap<number, number> = new Map([
    [DRAWN_POSE.strike, 0.5],
    [DRAWN_POSE.reach, 0.75],
    [DRAWN_POSE.hop, 0.75],
  ]);

  it('lets no side touch the ball more than three times', () => {
    const net = netOf(game);
    let most = 0;
    for (const lineup of [full, pairs]) {
      for (let rally = 0; rally < RALLIES; rally++) {
        const touches = [0, 0];
        let before: GameState | null = null;
        let beforeU = 0;
        sample(volleyballAt, game, lineup, rally, (state) => {
          if (before && (beforeU - net.u) * (state.ballU - net.u) < 0) touches.fill(0);
          for (const slot of playingIn(lineup)) {
            const code = codeOf(state.pose[slot]!);
            const contact = CONTACT.get(code);
            if (contact === undefined || codeOf(before?.pose[slot] ?? 0) !== code) continue;
            const was = progressOf(before!.pose[slot]!);
            if (was < contact && progressOf(state.pose[slot]!) >= contact) {
              const side = game.players[slot]!.side;
              touches[side]!++;
              most = Math.max(most, touches[side]!);
              expect(touches[side]).toBeLessThanOrEqual(3);
            }
          }
          beforeU = state.ballU;
          before = { ...state, pose: Float64Array.from(state.pose) };
        });
      }
    }
    expect(most).toBeGreaterThan(1);
  });

  it('sends the ball over the net above its top', () => {
    for (const lineup of [full, pairs, lineupOf(game, [0, 1])]) {
      for (let rally = 0; rally < RALLIES; rally++) {
        const heights = overTheNet(volleyballAt, game, lineup, rally);
        expect(heights.length).toBeGreaterThan(0);
        for (const height of heights) expect(height).toBeGreaterThan(netOf(game).top + 1);
      }
    }
  });

  it('has a lone player bump the ball up and down, never over the net', () => {
    const lone = lineupOf(game, [1]);
    for (let rally = 0; rally < RALLIES; rally++) {
      expect(overTheNet(volleyballAt, game, lone, rally)).toEqual([]);
      let high = 0;
      sample(volleyballAt, game, lone, rally, (state) => (high = Math.max(high, state.ballY)));
      expect(high).toBeGreaterThan(game.strike + 4);
    }
  });
});

describe('every game', () => {
  const cases = [
    ['tennis-court', [0, 1, 2]],
    ['basketball-court', [0, 1, 2, 3, 4, 5, 6]],
    ['volleyball', [0, 1, 2, 5]],
  ] as const;

  it('comes out the same for the same rally, whatever was replayed in between', () => {
    for (const [id, slots] of cases) {
      const game = gameOf(id);
      const lineup = lineupOf(game, slots);
      for (const time of [0.5, 3.2, 7.7, 15]) {
        const first = structuredClone(gameAt(game, lineup, 4, time, createGameState(12)));
        gameAt(game, lineupOf(game, [1]), 9, time + 1, createGameState(12));
        expect(gameAt(game, lineup, 4, time, createGameState(12))).toEqual(first);
      }
    }
  });

  it('keeps everybody on their own side of the net', () => {
    for (const id of ['tennis-court', 'volleyball', 'tennis-court-b', 'volleyball-b']) {
      const game = gameOf(id);
      const middle = netOf(game).u;
      const everybody = lineupOf(game, [...game.players.keys()]);
      for (const lineup of [everybody, lineupOf(game, [0, 1, 2]), lineupOf(game, [0])]) {
        for (let rally = 0; rally < 4; rally++) {
          sample(gameAt, game, lineup, rally, (state) => {
            for (const slot of playingIn(lineup)) {
              const side = game.players[slot]!.side;
              expect(Math.sign(state.u[slot]! - middle)).toBe(sideSignOf(game, side));
            }
          });
        }
      }
    }
  });

  it('keeps everybody in the half being played once they are there', () => {
    const game = gameOf('basketball-court-b');
    for (const lineup of [lineupOf(game, [0, 2]), lineupOf(game, [...game.players.keys()])]) {
      for (let rally = 0; rally < 4; rally++) {
        let half = 0;
        sample(basketballAt, game, lineup, rally, (state, time) => {
          if (time < 5) return;
          for (const slot of playingIn(lineup)) {
            half ||= Math.sign(state.u[slot]!);
            expect(Math.sign(state.u[slot]!)).toBe(half);
          }
        });
      }
    }
  });

  // Eased, a jog peaks at half as fast again as its average.
  it('moves nobody faster than a jog, and nobody by a jump', () => {
    const most = WALK_SPEED * 2 * 1.5 * STEP + 1e-6;
    for (const [id, slots] of cases) {
      const game = gameOf(id);
      for (const lineup of [lineupOf(game, slots), lineupOf(game, [...game.players.keys()])]) {
        for (let rally = 0; rally < 4; rally++) {
          let before: { u: Float64Array; v: Float64Array } | null = null;
          sample(gameAt, game, lineup, rally, (state) => {
            for (const slot of before ? playingIn(lineup) : []) {
              const step = Math.hypot(
                state.u[slot]! - before!.u[slot]!,
                state.v[slot]! - before!.v[slot]!,
              );
              expect(step, `${id} slot ${slot}`).toBeLessThanOrEqual(most);
            }
            before = { u: Float64Array.from(state.u), v: Float64Array.from(state.v) };
          });
        }
      }
    }
  });

  it('turns with the court', () => {
    for (const id of ['tennis-court', 'basketball-court', 'volleyball']) {
      const straight = gameOf(id);
      const turned = gameOf(id, 1);
      expect(turned.court).toEqual(straight.court);
      expect(Math.hypot(turned.frame.alongX, turned.frame.alongZ)).toBeCloseTo(1);
      expect(
        turned.frame.alongX * turned.frame.acrossX + turned.frame.alongZ * turned.frame.acrossZ,
      ).toBeCloseTo(0);
      for (const [slot, player] of turned.players.entries()) {
        expect(player.side).toBe(straight.players[slot]!.side);
        expect(Math.abs(player.u - straight.players[slot]!.u)).toBeLessThanOrEqual(1);
        expect(Math.abs(player.v - straight.players[slot]!.v)).toBeLessThanOrEqual(1);
      }
    }
  });
});
