/**
 * Who is sitting in the bay's boats, and where that puts them.
 *
 * `flotilla.ts` decides where every craft is and how it is riding the swell.
 * This is the one thing on top of that: a craft carries nought, one or two
 * figures, they are sitting down, and they go where it goes. Nobody boards and
 * nobody lands, so what a passenger *is* here is a seat on a hull plus a person
 * model to draw in it.
 *
 * ## A field of its own, not rows of `Crowd`
 *
 * The question is worth answering rather than assuming, because the crowd
 * already draws people sitting down and it would be one more column.
 *
 * **A passenger's position is not a segment.** Every person in `crowd.ts` is
 * walking `from` a point `to` a point at a rate, and the per-frame loop exists
 * to have no branch in it: an add, a compare, three lerps. A sit is that with
 * the two points equal. A passenger is neither: their position is a function of
 * a hull's pose this frame, which is three sines and a rotation. Put in the
 * crowd, twenty of them would either add a branch to the one loop written to
 * have none, for six hundred people, or have `from` and `to` rewritten every
 * frame from outside it, which is six writes and a lerp to arrive at what one
 * read already gives.
 *
 * **A passenger is not on the network.** The crowd's whole state is a graph
 * position: `node`, `cameFrom`, `gate`, and a seat index into `network.seats`.
 * A boat is not on the graph, has no node to be walked to and holds a seat the
 * network never heard of, so every one of those columns would sit at a sentinel
 * and every arrival branch would have to learn to ignore it.
 *
 * **Somebody has to be undrawn, and the crowd cannot do it.** A hire boat lying
 * at its berth carries nobody, so its passengers must vanish and come back.
 * The crowd's slots are handed out once per model at build and its `resting`
 * says only which of three poses somebody is in. A field of a couple of dozen
 * can compact its slots and shorten the draw every frame; a field of six
 * hundred should not.
 *
 * So: separate columns, and the one thing borrowed is the art. A passenger is
 * drawn from the same geometry and the same shader as anybody on a bench, in
 * the same seated pose. See `rendering/adapters/figureField.ts`.
 *
 * ## Berths come from the art, and are baked against nothing
 *
 * A boat declares its seats exactly as a bench does, with a {@link ModelSeat}
 * in its own coordinates, and that is deliberately *not* what
 * `crowd/domain/seating.ts` does with them. That module bakes a world position
 * out of a static placement, once, at load. A hull moves, heels and pitches
 * every frame, so a passenger's position cannot be baked at all: what is worked
 * out once is the seat's offset in the craft's own frame, and the pose is
 * applied to it per frame. Which is why the boats declared no seats until
 * something could read them this way, and why a declaration then was inert.
 *
 * ## Nothing here is a `Placement`, for the reason nothing afloat is
 *
 * A passenger reaches neither the lamp bake nor the sky-visibility bake, claims
 * no tile, casts no blob shadow and has no label anchor. Both volumes are static
 * by construction, and a person crossing a bay would rebuild them every frame.
 * What they get instead is the light for nothing, because the lit material
 * samples the volume wherever the instance matrix put them. See
 * `adapters/seaField.ts`.
 *
 * **Seeded**, for the reason the flotilla is: `pnpm bench` only compares two
 * runs if the scene has not moved.
 */

import type { ModelSeat, VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import { createRandom } from '../../layout/domain/random';
import { rotationRadians } from '../../layout/domain/rotation';
import { poseOf, type Flotilla } from './flotilla';

/**
 * Chance the first berth of a craft nobody hired out is taken.
 *
 * High, because the point of the exercise is that the bay's boats have people
 * in them: a rowing boat with nobody at the oars is a boat adrift, and a bay of
 * those reads as a bay of props. One in five empty is enough that the fleet is
 * not uniform, and a buoy line of a dozen marks plus the odd empty hull is what
 * keeps the water from looking staged.
 *
 * A hire craft skips this: somebody hired it, or it would be at its berth.
 */
const AT_THE_HELM = 0.8;

/**
 * Chance each further berth of a craft is taken, given the one before it was.
 *
 * Under a half, so most of the two-seaters carry one. Read together with the
 * rule below it: berths are filled from the first and the run stops at the
 * first refusal, which is what keeps a passenger from sitting in the stern of a
 * boat nobody is rowing. That makes this the chance of a *second* person rather
 * than of that seat in isolation, and the two-seat boats come out roughly a
 * third full crewed.
 */
const ALONGSIDE = 0.4;

/** Where one figure sits on a craft, in the craft's own frame, in voxels. */
export interface Berth {
  /** To starboard of the keel, from the middle of the hull's own box. */
  readonly x: number;
  /** Above the waterline, which is the layer the hips rest on. */
  readonly y: number;
  /** Forward of the middle of that box, towards the bow. */
  readonly z: number;
  /** Radians from the bow that the sitter's legs point. */
  readonly heading: number;
}

/**
 * The berths a sea model offers, from the seats its art declares.
 *
 * Two conversions, and the whole of the difference between a seat on a bench
 * and a seat on a boat.
 *
 * **Onto the craft's own middle.** A model's seats are measured from the corner
 * of its box, and what the field's matrix carries is the point `hungGeometry`
 * hangs the hull on: centred across and along, and on the lowest layer it
 * paints. Since a model's voxels are shifted onto their own origin when it is
 * built, that box runs from nothing to `width` by `depth`, so the hang is half
 * of each and the waterline is zero. Stated in voxels here rather than read off
 * a bounding box, because a berth has to be known without a renderer. See
 * `rendering/adapters/movingField.ts`, which is where the same hang is applied
 * to the geometry itself.
 *
 * **Half a voxel on both ground axes**, for the reason `seatSpotsFor` adds it: a
 * voxel column is a box and a person sits in the middle of one.
 *
 * The seat's `facing` is a turn from the model's own +z, and every hull in the
 * registry is drawn bow towards +z, so it is already a turn from the bow and
 * needs nothing done to it. A craft with no seats offers no berths and carries
 * nobody, which is the buoys.
 */
export function berthsOf(model: VoxelModel): Berth[] {
  return model.seats.map((seat: ModelSeat) => ({
    x: seat.x + 0.5 - model.width / 2,
    y: seat.y,
    z: seat.z + 0.5 - model.depth / 2,
    heading: rotationRadians(seat.facing),
  }));
}

export interface PassengersOptions {
  readonly flotilla: Flotilla;
  /**
   * The berths each sea model offers, indexed the way a craft's `variant` is.
   *
   * Passed rather than derived, for the reason the flotilla is handed its own
   * variants: the registry is read by the caller that reads registries, and
   * this stays free of the catalogue. See `voxel-gen/sea/index.ts`.
   */
  readonly berths: readonly (readonly Berth[])[];
  /** How many person models the scene has to draw passengers in. */
  readonly variants: number;
  readonly seed: number;
}

/** Everybody sitting in the bay's boats, as columns. See the header. */
export interface Passengers {
  readonly count: number;
  /** The craft each is aboard: a row of the flotilla. */
  readonly craft: Int32Array;
  /** Which person model each is drawn in. */
  readonly variant: Int32Array;
  /** The berth they are sitting in, in their craft's own frame. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** Radians from their craft's bow that their legs point. */
  readonly heading: Float32Array;
}

/**
 * Where one passenger is and how they are sitting, in the world.
 *
 * Six numbers rather than four because a figure on a boat rides the boat: the
 * heel and the trim are the hull's, and they are measured about the hull's own
 * axes rather than the sitter's, which is why {@link bow} is here beside
 * {@link heading}. The difference between the two is the berth's own turn, so a
 * rower facing astern still heels the way the boat does rather than the other
 * way.
 */
export interface AboardPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Radians about the vertical that the sitter's legs point. */
  readonly heading: number;
  /** Radians about the vertical that the bow points. */
  readonly bow: number;
  /** Radians the hull is heeled over, and radians bow-up. */
  readonly roll: number;
  readonly pitch: number;
}

/**
 * The bay's passengers, seated.
 *
 * Craft in flotilla order and berths in the order the art declared them, which
 * is what makes the first berth the one that is filled first: `rowboat.ts` puts
 * the rower's thwart first, so a boat carrying one person is a boat being rowed
 * rather than one drifting with somebody in the stern.
 *
 * The run stops at the first berth nobody takes, which is the whole of that
 * rule. It costs a `break` and it means a craft's crew is always a prefix of
 * its berths.
 *
 * A bay with nothing afloat, or a registry whose craft declare no seats, comes
 * back empty and the field draws nobody.
 */
export function createPassengers(options: PassengersOptions): Passengers {
  const { flotilla, berths, variants } = options;
  const random = createRandom(options.seed);
  const craft: number[] = [];
  const berth: Berth[] = [];

  for (let index = 0; index < flotilla.count; index++) {
    const offered = berths[flotilla.variant[index]!] ?? [];
    // A hire boat is out because somebody took it out, so its first berth is
    // taken whatever the dice say. Everything else is a boat that happens to be
    // on the water, and some of those are empty.
    let chance = flotilla.hired[index] === 1 ? 1 : AT_THE_HELM;
    for (const seat of offered) {
      if (random() >= chance) break;
      craft.push(index);
      berth.push(seat);
      chance = ALONGSIDE;
    }
  }

  const count = craft.length;
  const passengers: Passengers = {
    count,
    craft: Int32Array.from(craft),
    variant: new Int32Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    heading: new Float32Array(count),
  };
  for (let index = 0; index < count; index++) {
    passengers.variant[index] = Math.min(variants - 1, Math.floor(random() * variants));
    passengers.x[index] = berth[index]!.x;
    passengers.y[index] = berth[index]!.y;
    passengers.z[index] = berth[index]!.z;
    passengers.heading[index] = berth[index]!.heading;
  }
  return passengers;
}

/**
 * Whether a passenger is aboard right now, and so drawn at all.
 *
 * The one thing that changes about a passenger over time, and it costs no state
 * of its own: a hire boat's whole cycle is the sign of its {@link Flotilla.age},
 * so a pedalo lying at its berth is a pedalo whose guest has stepped off, and
 * one that is out is one carrying somebody. Nobody walks up the beach to do it,
 * and nobody has to: what anybody watching the bay sees is that the boats going
 * out have people in them and the ones tied up outside the hut do not.
 *
 * Every other craft is always crewed, because nothing takes a private boat
 * home.
 */
export function aboard(flotilla: Flotilla, passengers: Passengers, index: number): boolean {
  const craft = passengers.craft[index]!;
  return flotilla.hired[craft] === 0 || flotilla.age[craft]! >= 0;
}

/**
 * Where one passenger's hips are, and how they are sitting on the water.
 *
 * The craft's attitude applied to the berth, which is three rotations about the
 * hull's own axes in the order the field composes them: yaw, then pitch, then
 * roll. Written out rather than taken from a matrix library so that it stays
 * testable without a renderer, and because it is nine multiplies on a couple of
 * dozen rows.
 *
 * The heel is what makes this worth doing at all. A berth is a voxel or two off
 * the centreline, so three degrees of roll moves a sitter as much across as it
 * does up, and a figure that stayed put while its hull rolled under it would
 * read as sitting on the water beside the boat.
 */
export function poseAboard(flotilla: Flotilla, passengers: Passengers, index: number): AboardPose {
  const pose = poseOf(flotilla, passengers.craft[index]!);
  const x = passengers.x[index]!;
  const y = passengers.y[index]!;
  const z = passengers.z[index]!;

  // Roll first, about the fore-and-aft axis: the berth swings across and up.
  const cosRoll = Math.cos(pose.roll);
  const sinRoll = Math.sin(pose.roll);
  const acrossRolled = x * cosRoll - y * sinRoll;
  const upRolled = x * sinRoll + y * cosRoll;

  // Then pitch, about the athwartships axis: it swings up and along.
  const cosPitch = Math.cos(pose.pitch);
  const sinPitch = Math.sin(pose.pitch);
  const up = upRolled * cosPitch - z * sinPitch;
  const along = upRolled * sinPitch + z * cosPitch;

  // Then the bow's own bearing, which turns the two ground axes into the
  // world's. The hulls are drawn bow towards +z and the flotilla steers with
  // `atan2(sin, cos)` about that, so this is the same turn `seaField.ts` writes.
  const cosBow = Math.cos(pose.heading);
  const sinBow = Math.sin(pose.heading);
  return {
    x: pose.x + acrossRolled * cosBow + along * sinBow,
    y: pose.y + up,
    z: pose.z - acrossRolled * sinBow + along * cosBow,
    heading: pose.heading + passengers.heading[index]!,
    bow: pose.heading,
    roll: pose.roll,
    pitch: pose.pitch,
  };
}
