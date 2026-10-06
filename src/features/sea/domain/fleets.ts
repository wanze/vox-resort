import type { ModelFleet, ModelHire } from '../../../../voxel-gen/voxelgen.ts';
import type { FleetOptions } from './flotilla';
import type { Rental } from './swimArea';

export interface RentalHut extends Rental {
  readonly key: string;
  readonly id: string;
}

// Hut by hut, each hut's fleets in the order it declares them: allowances are handed out alike.
export function fleetsFor(
  rentals: readonly RentalHut[],
  hireOf: (id: string) => ModelHire | null,
  seaIndexOf: (id: string) => number,
  walkSpeed: number,
): FleetOptions[] {
  return rentals.flatMap((rental) =>
    (hireOf(rental.id)?.fleets ?? []).map((fleet) => ({
      rental,
      variant: seaIndexOf(fleet.craft),
      count: fleet.count,
      pace: fleet.pace * walkSpeed,
      tows: fleet.tows === undefined ? undefined : seaIndexOf(fleet.tows),
    })),
  );
}

// A craft goes out only full, so every fleet but the last takes whole crews and leaves the rest
// to the next; the last takes the remainder too, as nobody is sent home from the hut.
export function fleetAllowances(hirers: number, fleets: readonly ModelFleet[]): number[] {
  let left = Math.max(0, hirers);
  return fleets.map((fleet, index) => {
    const crews = left / fleet.riders;
    const whole = index === fleets.length - 1 ? Math.ceil(crews) : Math.floor(crews);
    const boats = Math.min(fleet.count, whole);
    left = Math.max(0, left - boats * fleet.riders);
    return boats;
  });
}

// In the order fleetsFor lays the fleets on the sea, so the nth number is the nth fleet's.
export function hutAllowances(
  rentals: readonly RentalHut[],
  hireOf: (id: string) => ModelHire | null,
  hirersAt: (key: string) => number,
): number[] {
  return rentals.flatMap((hut) => fleetAllowances(hirersAt(hut.key), hireOf(hut.id)?.fleets ?? []));
}
