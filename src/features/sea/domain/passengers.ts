import type { ModelSeat, VoxelModel } from '../../../../voxel-gen/voxelgen.ts';
import { createRandom } from '../../layout/domain/random';
import { rotationRadians } from '../../layout/domain/rotation';
import { poseOf, type Flotilla } from './flotilla';

// High, because an empty rowing boat reads as a prop. Hire craft skip this: they
// are out because somebody hired them.
const AT_THE_HELM = 0.8;

// Effectively the chance of a second person: berths fill from the first and the
// run stops at the first refusal.
const ALONGSIDE = 0.4;

export interface Berth {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

// Seats are measured from the model's corner, but the hull hangs from its middle
// on its lowest layer, matching hungGeometry in movingField.ts; +0.5 centres the sitter.
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
  readonly berths: readonly (readonly Berth[])[];
  readonly variants: number;
  readonly seed: number;
}

// Kept apart from Crowd: a passenger's position is a hull pose each frame, not a
// walked segment, and passengers vanish while their boat is berthed.
export interface Passengers {
  readonly count: number;
  readonly craft: Int32Array;
  readonly variant: Int32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly heading: Float32Array;
}

export interface AboardPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  // Separate from heading so a rower facing astern still heels with the boat.
  readonly bow: number;
  readonly roll: number;
  readonly pitch: number;
}

// Berths fill in declared order, so a boat carrying one person is being rowed.
export function createPassengers(options: PassengersOptions): Passengers {
  const { flotilla, berths, variants } = options;
  const random = createRandom(options.seed);
  const craft: number[] = [];
  const berth: Berth[] = [];

  for (let index = 0; index < flotilla.count; index++) {
    const offered = berths[flotilla.variant[index]!] ?? [];
    // A hire boat is out because somebody took it out, so its first berth is taken.
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

// No state of its own: a hire boat berthed (negative age) means its guest stepped off.
export function aboard(flotilla: Flotilla, passengers: Passengers, index: number): boolean {
  const craft = passengers.craft[index]!;
  return flotilla.hired[craft] === 0 || flotilla.age[craft]! >= 0;
}

// Written out rather than via a matrix library so it stays testable without a renderer.
export function poseAboard(flotilla: Flotilla, passengers: Passengers, index: number): AboardPose {
  const pose = poseOf(flotilla, passengers.craft[index]!);
  const x = passengers.x[index]!;
  const y = passengers.y[index]!;
  const z = passengers.z[index]!;

  // Same order the field composes them in: roll, then pitch, then the bow's bearing.
  const cosRoll = Math.cos(pose.roll);
  const sinRoll = Math.sin(pose.roll);
  const acrossRolled = x * cosRoll - y * sinRoll;
  const upRolled = x * sinRoll + y * cosRoll;

  const cosPitch = Math.cos(pose.pitch);
  const sinPitch = Math.sin(pose.pitch);
  const up = upRolled * cosPitch - z * sinPitch;
  const along = upRolled * sinPitch + z * cosPitch;

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
