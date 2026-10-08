import { describe, expect, it } from 'vitest';
import { SHOWN } from '../../choreography/domain/casting';
import { RESTING } from '../../crowd/domain/crowd';
import { createFlotilla, type Flotilla } from '../../sea/domain/flotilla';
import { CHILD_FRAMING, GUEST_FRAMING, WATCH_FRAMING } from './followRig';
import {
  craftSighting,
  guestSighting,
  lookOf,
  type GuestSources,
  type Sighting,
} from './followTarget';

const PEOPLE = 3;

function sources(): GuestSources & { resting: (person: number) => number; still: number[] } {
  const still = Array.from({ length: PEOPLE }, () => RESTING.none);
  return {
    crowd: {
      x: Float32Array.of(10, 20, 30),
      y: Float32Array.of(0, 0, 0),
      z: Float32Array.of(5, 5, 5),
      heading: Float32Array.of(0, 1, 2),
      offPlot: new Uint8Array(PEOPLE),
    },
    drawn: {
      shown: new Uint8Array(PEOPLE),
      x: Float32Array.of(70, 80, 90),
      y: Float32Array.of(1, 1, 1),
      z: Float32Array.of(9, 9, 9),
      heading: Float32Array.of(3, 3, 3),
      pose: new Float32Array(PEOPLE),
    },
    guests: {
      present: Uint8Array.of(1, 1, 1),
      party: Int32Array.of(4, 4, 5),
      child: Uint8Array.of(0, 1, 0),
    },
    still,
    resting: (person) => still[person]!,
  };
}

const guest = (person: number, party: number) => ({ person, party });

describe('guestSighting', () => {
  it('sees somebody walking where the crowd has them, at an adult’s eye', () => {
    const sighting = guestSighting(sources(), guest(0, 4));
    expect(sighting).toEqual({
      kind: 'seen',
      pose: { at: { x: 10, y: 0, z: 5 }, heading: 0, framing: GUEST_FRAMING },
      firstPerson: true,
    });
  });

  it('sees somebody the cast placed where the cast drew them', () => {
    const from = sources();
    (from.drawn.shown as Uint8Array)[2] = SHOWN.placed;
    const sighting = guestSighting(from, guest(2, 5));
    expect(sighting.kind === 'seen' && sighting.pose.at).toEqual({ x: 90, y: 1, z: 9 });
  });

  it('watches somebody hidden indoors or off the plot from where the crowd holds them', () => {
    const from = sources();
    (from.drawn.shown as Uint8Array)[0] = SHOWN.hidden;
    (from.crowd.offPlot as Uint8Array)[2] = 1;
    for (const [person, party] of [
      [0, 4],
      [2, 5],
    ] as const) {
      const sighting = guestSighting(from, guest(person, party));
      expect(sighting.kind).toBe('hidden');
      expect(sighting.kind === 'hidden' && sighting.pose.framing).toBe(WATCH_FRAMING);
      expect(sighting.kind === 'hidden' && sighting.pose.at.x).toBe(from.crowd.x[person]);
    }
  });

  it('loses somebody who checked out, or whose body went to a new party', () => {
    const from = sources();
    (from.guests.present as Uint8Array)[0] = 0;
    expect(guestSighting(from, guest(0, 4)).kind).toBe('gone');
    expect(guestSighting(sources(), guest(1, 9)).kind).toBe('gone');
  });

  it('has a child’s eye one voxel lower and a seated eye two lower', () => {
    const child = guestSighting(sources(), guest(1, 4));
    expect(child.kind === 'seen' && child.pose.framing).toBe(CHILD_FRAMING);
    expect(CHILD_FRAMING.eye).toBe(GUEST_FRAMING.eye - 1);
    const from = sources();
    from.still[0] = RESTING.sitting;
    const seated = guestSighting(from, guest(0, 4));
    expect(seated.kind === 'seen' && seated.pose.framing.eye).toBe(GUEST_FRAMING.eye - 2);
  });

  it('asks for third person while lying down, wherever they are drawn', () => {
    const from = sources();
    from.still[0] = RESTING.lying;
    (from.drawn.shown as Uint8Array)[2] = SHOWN.placed;
    (from.drawn.pose as Float32Array)[2] = RESTING.lying + 0.4;
    for (const [person, party] of [
      [0, 4],
      [2, 5],
    ] as const) {
      const sighting = guestSighting(from, guest(person, party));
      expect(sighting.kind === 'seen' && sighting.firstPerson).toBe(false);
    }
  });
});

const GROUND = { westX: 0, eastX: 400, seawardZ: 700, landwardZ: () => 560 };

function hiredBay(): Flotilla {
  return createFlotilla({
    moorings: [{ x: 40, z: 520 }],
    buoyVariant: 0,
    craft: 0,
    craftVariants: [],
    fleets: [{ rental: { x: 120, z: 500 }, variant: 5, count: 2, pace: 1, tows: 6 }],
    hireAllowed: [2],
    ground: GROUND,
    waterline: 0.1,
    seed: 3,
  });
}

describe('craftSighting', () => {
  it('sees a hired craft while it is out and loses it once tied up', () => {
    const bay = hiredBay();
    const tug = bay.towedBy.findIndex((pulling) => pulling >= 0) - 1;
    bay.age[tug] = 5;
    expect(craftSighting(bay, tug, 0).kind).toBe('seen');
    bay.age[tug] = -1;
    expect(craftSighting(bay, tug, 0).kind).toBe('gone');
  });

  it('follows a towed craft out and in with its tug', () => {
    const bay = hiredBay();
    const towed = bay.towedBy.findIndex((pulling) => pulling >= 0);
    bay.age[towed - 1] = 5;
    bay.age[towed] = -1;
    expect(craftSighting(bay, towed, 0).kind).toBe('seen');
    bay.age[towed - 1] = -1;
    bay.age[towed] = 5;
    expect(craftSighting(bay, towed, 0).kind).toBe('gone');
  });

  it('never rides a buoy', () => {
    expect(craftSighting(hiredBay(), 0, 0).kind).toBe('gone');
  });
});

describe('lookOf', () => {
  const pose = { at: { x: 0, y: 0, z: 0 }, heading: 0, framing: GUEST_FRAMING };
  const seen: Sighting = { kind: 'seen', pose, firstPerson: true };

  it('looks through the eyes asked for, leaving that body out', () => {
    expect(lookOf(seen, 'first', 4)).toEqual({
      view: 'first',
      firstPerson: true,
      hidden: 4,
      occluded: false,
    });
  });

  it('pulls a third-person camera in for walls, and hides nobody', () => {
    expect(lookOf(seen, 'third', 4)).toEqual({
      view: 'third',
      firstPerson: true,
      hidden: null,
      occluded: true,
    });
  });

  it('stays in third person for somebody lying down or out of sight', () => {
    expect(lookOf({ ...seen, firstPerson: false }, 'first', 4).view).toBe('third');
    const hidden = lookOf(
      { kind: 'hidden', pose: { ...pose, framing: WATCH_FRAMING } },
      'first',
      4,
    );
    expect(hidden).toEqual({ view: 'third', firstPerson: false, hidden: null, occluded: false });
  });
});
