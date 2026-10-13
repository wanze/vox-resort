import { createRandom } from '../../layout/domain/random';
import { fnv } from '../../random/domain/hash';
import type { StyleOf } from '../../layout/domain/resortLayout';
import type { Plaza } from '../../layout/domain/resortPlan';
import { familyOf, stylesOf } from './objectTypes';

export const ONE_OFF = 0.1;

// Rows of loungers that change style from one block to the next read as a mistake. Lamps never
// reach the mix: the layout styles them by their ground.
export const RESORT_WIDE: ReadonlySet<string> = new Set(['sun-lounger']);

// A render chunk, so a cell never splits a near-layer bucket between two styles.
const CELL_SHIFT = 4;

export interface StyleMixOptions {
  readonly seed: number;
  readonly neighbourhoods: readonly Plaza[];
  // The chance one placement ignores its neighbourhood and rolls on its own; 1 scatters.
  readonly oneOff: number;
  // Families built in one style across the whole plot.
  readonly uniform?: ReadonlySet<string>;
}

// Hashed rather than drawn from a shared stream, so styling can never shift the generator's draws.
export const rollFor = (text: string): number => createRandom(fnv(text))();

function regionOf(neighbourhoods: readonly Plaza[], tileX: number, tileZ: number): string {
  const index = neighbourhoods.findIndex(
    (rect) => tileX >= rect.x0 && tileX <= rect.x1 && tileZ >= rect.z0 && tileZ <= rect.z1,
  );
  return index >= 0 ? `n:${index}` : `c:${tileX >> CELL_SHIFT},${tileZ >> CELL_SHIFT}`;
}

export function styleMix({ seed, neighbourhoods, oneOff, uniform }: StyleMixOptions): StyleOf {
  return (id, tileX, tileZ) => {
    const family = familyOf(id);
    const styles = stylesOf(family);
    if (styles.length < 2) return id;
    const pick = (roll: number): string => styles[Math.floor(roll * styles.length)]!.id;
    if (uniform?.has(family)) return pick(rollFor(`${seed}|${family}`));
    const here = `${seed}|${family}|${tileX},${tileZ}`;
    if (rollFor(here) < oneOff) return pick(rollFor(`${here}|own`));
    return pick(rollFor(`${seed}|${family}|${regionOf(neighbourhoods, tileX, tileZ)}`));
  };
}
