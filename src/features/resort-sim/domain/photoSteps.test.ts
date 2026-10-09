import { describe, expect, it, vi } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { ON_SAND } from '../../crowd/domain/crowd';
import { isBeach, shoreFor } from '../../layout/domain/shoreline';
import { TILE_VOXELS } from '../../catalog/domain/objectTypes';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { NEVER, PHOTO_GAP_TICKS, PHOTO_SECONDS } from '../../sim/domain/photos';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';
import { stayCount } from '../../sim/domain/thoughts';
import { momentAt } from '../../sim/domain/views';
import { NO_MOMENT, photoPause, refreshMoment } from './photoSteps';
import { plotFactsOf } from './plotFacts';
import { createSimState, type SimState } from './simState';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const shore = shoreFor(plan);
const plot = { ...world, layout: world };
const facts = plotFactsOf({ plan, shore, terrain: terrainFor(plan) }, world, new Map());

const freshState = (): SimState =>
  createSimState({
    plan,
    plot,
    shore,
    facts,
    population: 60,
    away: false,
    guestVariants: 4,
    childVariant: 1,
    staffVariants: 4,
    clock: { ticks: () => 0, tickOfDay: () => 0, weather: () => 'clear' },
  });

const EVENING = Math.round((21 / 24) * TICKS_PER_DAY);

const tileOf = (node: number): number => {
  const at = facts.network.nodes[node]!;
  return at.tileZ * facts.views.tilesX + at.tileX;
};

// The node with the widest view of the sea, where a sunset is sure to be in the picture.
const shoreNode = facts.network.nodes.reduce(
  (best, _, node) =>
    facts.views.sea[tileOf(node)]! > facts.views.sea[tileOf(best)]! ? node : best,
  0,
);

const photographer = (state: SimState): number => {
  for (let person = 0; person < state.guests.count; person++) {
    const adult = state.guests.present[person] === 1 && state.guests.child[person] !== 1;
    if (adult && state.router.isFree(person)) return person;
  }
  throw new Error('nobody is free to take a photo');
};

// The first evening tick on which the hash lets this person take the photo.
function firstPhoto(state: SimState, person: number) {
  for (let tick = EVENING; tick < EVENING + 60; tick++) {
    const pause = photoPause(state, person, shoreNode, tick);
    if (pause) return { pause, tick };
  }
  return null;
}

describe('photoPause', () => {
  it('stands a guest on the shore at sunset for a picture of it, and remembers it', () => {
    const state = freshState();
    state.moment = momentAt(EVENING, 'clear', false);
    const person = photographer(state);
    const stay = state.happiness.stay[person]!;
    const taken = firstPhoto(state, person);
    expect(facts.views.sea[tileOf(shoreNode)]).toBeGreaterThanOrEqual(0.5);
    expect(taken, 'no photo in an hour on the shore').not.toBeNull();
    expect(taken!.pause.seconds).toBe(PHOTO_SECONDS);
    expect(state.photos.lastAt[person]).toBe(taken!.tick);
    expect(state.photos.heat[shoreNode]).toBe(1);
    expect(state.happiness.stay[person]).toBeCloseTo(stay + 0.01);
    expect(stayCount(state.thoughts, person, 'sunset')).toBe(1);
    expect(state.today.photos?.taken).toBe(1);
    expect(state.today.photos?.spots[0]).toMatchObject({
      kind: 'sunset',
      subject: expect.stringMatching(/^Sunset/),
    });
    expect(state.today.photos?.spots[0]!.heading).toBe(taken!.pause.heading);
  });

  it('waits out the gap before the same guest takes another', () => {
    const state = freshState();
    state.moment = momentAt(EVENING, 'clear', false);
    const person = photographer(state);
    const taken = firstPhoto(state, person)!;
    for (let tick = taken.tick; tick < taken.tick + PHOTO_GAP_TICKS; tick++) {
      expect(photoPause(state, person, shoreNode, tick)).toBeNull();
    }
  });

  it('stops nobody in the rain, before the first frame, or a child', () => {
    const state = freshState();
    const person = photographer(state);
    state.moment = momentAt(EVENING, 'rain', false);
    expect(firstPhoto(state, person)).toBeNull();
    state.moment = NO_MOMENT;
    expect(firstPhoto(state, person)).toBeNull();
    state.moment = momentAt(EVENING, 'clear', false);
    state.guests.child[person] = 1;
    expect(firstPhoto(state, person)).toBeNull();
    expect(state.photos.lastAt[person]).toBe(NEVER);
  });

  it('takes the moment from the clock', () => {
    const state = freshState();
    const now = { ticks: EVENING, day: 0, tickOfDay: EVENING, forcedWeather: null };
    refreshMoment(state, { ...now, weather: 'clear' });
    expect(state.moment.golden).toBeGreaterThan(0);
    refreshMoment(state, { ...now, weather: 'storm' });
    expect(state.moment.wet).toBe(true);
  });

  // The beach tile with the widest view of the sea, and a guest stood on it.
  const onTheShore = (state: SimState, person: number): void => {
    let best = -1;
    for (let tile = 0; tile < facts.views.sea.length; tile++) {
      const tileX = tile % facts.views.tilesX;
      const tileZ = Math.floor(tile / facts.views.tilesX);
      if (!isBeach(shore, tileX, tileZ)) continue;
      if (best < 0 || facts.views.sea[tile]! > facts.views.sea[best]!) best = tile;
    }
    const { crowd } = state.crowd;
    crowd.x[person] = ((best % facts.views.tilesX) + 0.5) * TILE_VOXELS;
    crowd.z[person] = (Math.floor(best / facts.views.tilesX) + 0.5) * TILE_VOXELS;
  };

  const onTheSand = (state: SimState, person: number) => {
    for (let tick = EVENING; tick < EVENING + 60; tick++) {
      const pause = photoPause(state, person, ON_SAND, tick);
      if (pause) return { pause, tick };
    }
    return null;
  };

  it('stops a guest walking the sand to their pitch for the sunset, counted but not on a node', () => {
    const state = freshState();
    state.moment = momentAt(EVENING, 'clear', false);
    const person = photographer(state);
    onTheShore(state, person);
    vi.spyOn(state.router, 'stayOf').mockReturnValue('arriving');
    const taken = onTheSand(state, person);
    expect(taken, 'no photo in an hour on the sand').not.toBeNull();
    expect(stayCount(state.thoughts, person, 'sunset')).toBe(1);
    expect(Array.from(state.photos.heat).every((heat) => heat === 0)).toBe(true);
    const spot = state.today.photos?.spots[0];
    expect(spot).toMatchObject({ kind: 'sunset', x: state.crowd.crowd.x[person] });
  });

  it('never stops a guest resting on the beach', () => {
    const state = freshState();
    state.moment = momentAt(EVENING, 'clear', false);
    const person = photographer(state);
    onTheShore(state, person);
    vi.spyOn(state.router, 'stayOf').mockReturnValue('resting');
    expect(onTheSand(state, person)).toBeNull();
    expect(state.photos.lastAt[person]).toBe(NEVER);
  });
});
