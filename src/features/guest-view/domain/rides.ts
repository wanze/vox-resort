import { SHOWN } from '../../choreography/domain/casting';
import { RESTING } from '../../crowd/domain/crowd';
import type { GuestSources } from './followTarget';

// Only what deciding a ride reads, so a test can lay out a bay by hand.
export interface RideFleet {
  readonly count: number;
  readonly variant: ArrayLike<number>;
  readonly hired: ArrayLike<number>;
  readonly fleet: ArrayLike<number>;
  readonly towedBy: ArrayLike<number>;
  readonly age: ArrayLike<number>;
}

export interface RideOffer {
  readonly variant: number;
  readonly craft: number;
  // The only one of its kind on the water, out or tied up.
  readonly only: boolean;
}

// A towed craft is out while its tug is, and keeps no hire of its own.
const leadOf = (flotilla: RideFleet, index: number): number => {
  const tug = flotilla.towedBy[index]!;
  return tug >= 0 ? tug : index;
};

// The negative age `aboard` reads as tied up; a drifting craft is never hired, so always out.
export function craftOut(flotilla: RideFleet, index: number, buoyVariant: number): boolean {
  if (index < 0 || index >= flotilla.count) return false;
  if (flotilla.variant[index] === buoyVariant) return false;
  const lead = leadOf(flotilla, index);
  return flotilla.hired[lead] === 0 || flotilla.age[lead]! >= 0;
}

// Youngest hire first, so the ride offered has the longest left; NaN for a drifting craft.
const hireAge = (flotilla: RideFleet, index: number): number => {
  const lead = leadOf(flotilla, index);
  return flotilla.hired[lead] === 1 ? flotilla.age[lead]! : Number.NaN;
};

function better(flotilla: RideFleet, best: number, index: number): boolean {
  if (best < 0) return true;
  const age = hireAge(flotilla, index);
  const bestAge = hireAge(flotilla, best);
  if (Number.isNaN(age)) return false;
  return Number.isNaN(bestAge) || age < bestAge;
}

function youngest(flotilla: RideFleet, out: (index: number) => boolean): number {
  let best = -1;
  for (let index = 0; index < flotilla.count; index++) {
    if (out(index) && better(flotilla, best, index)) best = index;
  }
  return best;
}

// One per kind of craft out, in the order the sea's models are registered.
export function rideOffers(flotilla: RideFleet, buoyVariant: number): readonly RideOffer[] {
  const variants = new Set<number>();
  for (let index = 0; index < flotilla.count; index++) {
    if (craftOut(flotilla, index, buoyVariant)) variants.add(flotilla.variant[index]!);
  }
  const ofKind = (variant: number): number =>
    Array.from(flotilla.variant).filter((each) => each === variant).length;
  return [...variants]
    .toSorted((a, b) => a - b)
    .map((variant) => ({
      variant,
      craft: youngest(
        flotilla,
        (index) => flotilla.variant[index] === variant && craftOut(flotilla, index, buoyVariant),
      ),
      only: ofKind(variant) === 1,
    }));
}

// `fleetHuts` names each fleet's hut, in the order the fleets were laid on the sea.
export function hutRide(
  flotilla: RideFleet,
  fleetHuts: readonly string[],
  hutKey: string,
  buoyVariant: number,
): number | null {
  const fromHut = (index: number): boolean => {
    const fleet = flotilla.fleet[leadOf(flotilla, index)]!;
    return fleet >= 0 && fleetHuts[fleet] === hutKey && craftOut(flotilla, index, buoyVariant);
  };
  const craft = youngest(flotilla, fromHut);
  return craft < 0 ? null : craft;
}

// Somebody walking, so a measured run follows a moving camera from its first frame.
export function benchGuest(sources: GuestSources): number | null {
  const { crowd, drawn, guests } = sources;
  for (let person = 0; person < guests.present.length; person++) {
    if (guests.present[person] !== 1 || crowd.offPlot[person] === 1) continue;
    if ((drawn.shown[person] ?? SHOWN.asCrowd) !== SHOWN.asCrowd) continue;
    if (sources.resting(person) === RESTING.none) return person;
  }
  return null;
}
