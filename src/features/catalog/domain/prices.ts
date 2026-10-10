import type { GameMode } from '../../sim/domain/ledger';
import { OBJECT_TYPES } from './objectTypes';

// A path tile costs 20, so paving the reference plot is a seventh of what stands on it.
const VOXELS_PER_UNIT = 25;

const STEP = 10;

const MIN_COST = 10;

const REFUND_SHARE = 0.5;

export const DIG_COST = 20;

// Flat on purpose until play says otherwise: a fifth of the tycoon opening balance per parcel.
export const LAND_PARCEL_COST = 1_500;

// Capped: a rate driven by flowerbeds would make a bungalow in a garden outearn a hotel.
export const SETTING_PREMIUM = 0.25;

function derivedCost(voxels: number): number {
  return Math.max(MIN_COST, Math.round(voxels / VOXELS_PER_UNIT / STEP) * STEP);
}

const OWN_COSTS: ReadonlyMap<string, number> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.cost ?? derivedCost(type.model.dayVoxelCount)]),
);

// A style is free: sized by its own voxels, Game Hall B would cost more than twice its A.
const COSTS: ReadonlyMap<string, number> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.model.cost ?? OWN_COSTS.get(type.family)!]),
);

const PRICES: ReadonlyMap<string, number> = new Map(
  OBJECT_TYPES.map((type) => [type.id, type.venue?.price ?? 0]),
);

export function buildCostOf(id: string): number {
  const cost = COSTS.get(id);
  if (cost === undefined) throw new Error(`Unknown object type "${id}"`);
  return cost;
}

// The beach is a venue the catalogue does not know, so an unknown id answers 0.
export function priceOf(id: string): number {
  return PRICES.get(id) ?? 0;
}

// A lifted placement is a neighbour the paving re-laid, a consequence of the click, not a purchase.
export function costToStand(id: string, lifted: boolean): number {
  return lifted ? 0 : buildCostOf(id);
}

export function refundOf(id: string, stillBuilding: boolean): number {
  const cost = buildCostOf(id);
  return stillBuilding ? cost : Math.round(cost * REFUND_SHARE);
}

// The player's factor on the list price; rounded once, so a ledger never holds a fraction.
export const chargeOf = (id: string, factor: number): number => Math.round(priceOf(id) * factor);

// The factor first: the surroundings raise whatever the player asks, as they raise the list price.
export function nightPriceOf(id: string, setting: number, factor = 1): number {
  const premium = SETTING_PREMIUM * Math.min(1, Math.max(0, setting));
  return Math.round(priceOf(id) * factor * (1 + premium));
}

export function landPriceOf(mode: GameMode): number {
  return mode === 'sandbox' ? 0 : LAND_PARCEL_COST;
}
