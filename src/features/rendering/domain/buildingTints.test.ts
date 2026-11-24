import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../../voxel-gen/palette.ts';
import { linearRgbOf } from '../../lighting/domain/lightGrid';
import { rampSwap, ROOF_SWAP, WALL_SWAP } from './buildingTints';

describe('rampSwap', () => {
  it('recognises every step of the ramp it swaps', () => {
    const swap = rampSwap(PALETTE.stucco, [PALETTE.stucco.base]);
    const { light, base, shade, deep } = PALETTE.stucco;
    expect(swap.steps).toEqual([light, base, shade, deep].map(linearRgbOf));
  });

  it('turns the base into the tint', () => {
    const swap = rampSwap(PALETTE.terracotta, [0x336699]);
    const base = linearRgbOf(PALETTE.terracotta.base);
    const turned = base.map((channel, index) => channel * swap.factors[0]![index]!);
    linearRgbOf(0x336699).forEach((channel, index) => expect(turned[index]).toBeCloseTo(channel));
  });

  it("keeps the art's own colour as the first choice", () => {
    for (const swap of [WALL_SWAP, ROOF_SWAP]) {
      swap.factors[0]!.forEach((factor) => expect(factor).toBeCloseTo(1));
      expect(swap.factors.length).toBeGreaterThan(1);
    }
  });

  it('never lifts a step past white', () => {
    for (const swap of [WALL_SWAP, ROOF_SWAP]) {
      for (const factor of swap.factors) {
        for (const step of swap.steps) {
          step.forEach((channel, index) => expect(channel * factor[index]!).toBeLessThanOrEqual(1));
        }
      }
    }
  });
});
