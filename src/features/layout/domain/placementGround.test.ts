import { describe, expect, it } from 'vitest';
import { BEACH_REACH, groundTakes, SHORE_REACH, type PlacementGroundView } from './placementGround';

/** A column of ground read off a string, north to south: g grass, s sand, d dune, w sea. */
function column(cells: string): PlacementGroundView {
  const at = (tileZ: number): string => cells[tileZ] ?? 'w';
  return {
    levelOf: (_x, z) => (at(z) === 'd' ? 1 : 0),
    isSand: (_x, z) => at(z) === 's' || at(z) === 'd',
    isSea: (_x, z) => at(z) === 'w',
  };
}

describe('groundTakes', () => {
  it('takes anything anywhere dry when the object declares no ground', () => {
    const view = column('ggssw');
    expect(groundTakes(undefined, view, 0, 0)).toBe(true);
  });

  it('takes a beach object on sand that runs down to the sea', () => {
    const view = column('ggsssw');
    expect(groundTakes('beach', view, 0, 2)).toBe(true);
    expect(groundTakes('beach', view, 0, 4)).toBe(true);
  });

  it('refuses a beach object on grass, in the sea, or up on the dune', () => {
    const view = column('gdsssw');
    expect(groundTakes('beach', view, 0, 0)).toBe(false);
    expect(groundTakes('beach', view, 0, 1)).toBe(false);
    expect(groundTakes('beach', view, 0, 5)).toBe(false);
  });

  it('refuses sand that ends in grass before the water', () => {
    const view = column('ssggsw');
    expect(groundTakes('beach', view, 0, 0)).toBe(false);
    expect(groundTakes('beach', view, 0, 4)).toBe(true);
  });

  it('holds a shore object to the few rows at the water', () => {
    const sand = 's'.repeat(BEACH_REACH - 1);
    const view = column(`g${sand}w`);
    const water = BEACH_REACH;
    expect(groundTakes('shore', view, 0, water - SHORE_REACH)).toBe(true);
    expect(groundTakes('shore', view, 0, water - SHORE_REACH - 1)).toBe(false);
    expect(groundTakes('beach', view, 0, 1)).toBe(true);
  });
});
