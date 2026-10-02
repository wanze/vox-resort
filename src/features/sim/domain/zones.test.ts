import { describe, expect, it } from 'vitest';
import {
  anyZone,
  createZones,
  dealZones,
  NO_ZONE,
  paintZone,
  staffByZone,
  workplaceZones,
  zoneAt,
  zonesIn,
  zonesOf,
  ZONES,
} from './zones';

const WEST_HALF = (tileX: number): boolean => tileX < 2;

describe('paintZone', () => {
  it('paints a tile and erases it again', () => {
    const zones = createZones(4, 3);
    expect(zoneAt(zones, 1, 2)).toBe(NO_ZONE);
    paintZone(zones, 1, 2, 3);
    expect(zoneAt(zones, 1, 2)).toBe(3);
    expect(zones.zone[2 * 4 + 1]).toBe(3);
    paintZone(zones, 1, 2, NO_ZONE);
    expect(zoneAt(zones, 1, 2)).toBe(NO_ZONE);
  });

  it('moves the version only when a tile changes', () => {
    const zones = createZones(4, 4);
    expect(paintZone(zones, 0, 0, 1)).toBe(true);
    expect(zones.version).toBe(1);
    expect(paintZone(zones, 0, 0, 1)).toBe(false);
    expect(paintZone(zones, 1, 1, NO_ZONE)).toBe(false);
    expect(zones.version).toBe(1);
  });

  it('leaves land not owned unzoned', () => {
    const zones = createZones(4, 1);
    for (let tileX = 0; tileX < 4; tileX++) paintZone(zones, tileX, 0, 2, WEST_HALF);
    expect([...zones.zone]).toEqual([2, 2, NO_ZONE, NO_ZONE]);
  });

  it('ignores tiles off the grid and zones that do not exist', () => {
    const zones = createZones(2, 2);
    expect(paintZone(zones, -1, 0, 0)).toBe(false);
    expect(paintZone(zones, 2, 0, 0)).toBe(false);
    expect(paintZone(zones, 0, 0, ZONES)).toBe(false);
    expect(zones.version).toBe(0);
    expect(anyZone(zones)).toBe(false);
  });
});

describe('zoneAt', () => {
  it('calls a tile outside the grid unzoned', () => {
    const zones = createZones(2, 2);
    zones.zone.fill(0);
    expect(zoneAt(zones, -1, 0)).toBe(NO_ZONE);
    expect(zoneAt(zones, 0, 2)).toBe(NO_ZONE);
    expect(zoneAt(zones, 1, 1)).toBe(0);
  });
});

describe('zonesOf', () => {
  const footprint = { tileX: 2, tileZ: 2, tilesX: 2, tilesZ: 2 };

  it('finds a footprint in one zone', () => {
    const zones = createZones(8, 8);
    paintZone(zones, 3, 3, 2);
    expect(zonesOf(zones, footprint, [])).toBe(0b100);
  });

  it('finds a footprint on the border of two zones in both', () => {
    const zones = createZones(8, 8);
    paintZone(zones, 2, 2, 0);
    paintZone(zones, 3, 2, 1);
    expect(zonesOf(zones, footprint, [])).toBe(0b11);
  });

  it('finds a footprint on unpainted ground in none', () => {
    const zones = createZones(8, 8);
    paintZone(zones, 5, 5, 0);
    expect(zonesOf(zones, footprint, [])).toBe(0);
  });

  it('counts the path in front of a door', () => {
    const zones = createZones(8, 8);
    paintZone(zones, 2, 4, 3);
    expect(zonesOf(zones, footprint, [])).toBe(0);
    expect(zonesOf(zones, footprint, [{ tileX: 2, tileZ: 4 }])).toBe(0b1000);
  });
});

describe('workplaceZones', () => {
  it('gives every venue to cleaners, and the rest only to the role that works there', () => {
    const zones = createZones(4, 4);
    const venues = [{}, { stage: true }, { bathing: true }, { reliability: 40 }];
    const held = workplaceZones(zones, venues, Int32Array.from([0b0001, 0b0010, 0b0100, 0b1000]), {
      paved: [],
      towers: [],
    });
    expect(held).toEqual({
      cleaner: 0b1111,
      animator: 0b0010,
      lifeguard: 0b0100,
      mechanic: 0b1000,
    });
  });

  it('counts painted paving for cleaners and a painted tower tile for lifeguards', () => {
    const zones = createZones(4, 4);
    paintZone(zones, 0, 0, 1);
    paintZone(zones, 3, 3, 2);
    const held = workplaceZones(zones, [], new Int32Array(0), {
      paved: [
        { tileX: 0, tileZ: 0 },
        { tileX: 1, tileZ: 0 },
      ],
      towers: [{ tileX: 3, tileZ: 3 }],
    });
    expect(held).toEqual({ cleaner: 0b010, animator: 0, lifeguard: 0b100, mechanic: 0 });
  });

  it('holds cleaners, and nobody else, in a zone painted only on the beach', () => {
    const zones = createZones(4, 4);
    paintZone(zones, 2, 3, 3);
    const held = workplaceZones(zones, [], new Int32Array(0), {
      paved: [{ tileX: 0, tileZ: 0 }],
      towers: [],
      beach: [
        { tileX: 2, tileZ: 3 },
        { tileX: 3, tileZ: 3 },
      ],
    });
    expect(held).toEqual({ cleaner: 0b1000, animator: 0, lifeguard: 0, mechanic: 0 });
  });
});

describe('zonesIn', () => {
  it('lists the zones of a mask in zone order', () => {
    expect(zonesIn(0b1010)).toEqual([1, 3]);
    expect(zonesIn(0)).toEqual([]);
  });
});

describe('dealZones', () => {
  it('deals each role round-robin over its own zones', () => {
    const roles = [0, 0, 0, 1, 1];
    const duty = Uint8Array.from([1, 1, 1, 1, 1]);
    expect([...dealZones(roles, duty, [[1, 3], [2]])]).toEqual([1, 3, 1, 2, 2]);
  });

  it('lets a role with no zoned workplace roam the whole plot', () => {
    const roles = [0, 1, 1];
    const duty = Uint8Array.from([1, 1, 1]);
    expect([...dealZones(roles, duty, [[0], []])]).toEqual([0, NO_ZONE, NO_ZONE]);
  });

  it('leaves off-duty workers unzoned and deals past them', () => {
    const roles = [0, 0, 0];
    const duty = Uint8Array.from([0, 1, 1]);
    expect([...dealZones(roles, duty, [[0, 1]])]).toEqual([NO_ZONE, 0, 1]);
  });

  it('leaves everybody unzoned with no zones painted', () => {
    const roles = [0, 1, 2, 3];
    const duty = Uint8Array.from([1, 1, 1, 1]);
    expect([...dealZones(roles, duty, [[], [], [], []])]).toEqual([
      NO_ZONE,
      NO_ZONE,
      NO_ZONE,
      NO_ZONE,
    ]);
  });
});

describe('anyZone', () => {
  it('says whether anything is painted', () => {
    const zones = createZones(3, 3);
    expect(anyZone(zones)).toBe(false);
    paintZone(zones, 2, 2, 0);
    expect(anyZone(zones)).toBe(true);
  });
});

describe('staffByZone', () => {
  it('counts the dealt staff of each role per zone, and leaves the unzoned out', () => {
    const counts = staffByZone(
      ['cleaner', 'cleaner', 'lifeguard', 'mechanic'],
      Int8Array.from([0, 0, 3, NO_ZONE]),
    );
    expect(counts).toHaveLength(ZONES);
    expect(counts[0]).toEqual({ cleaner: 2, lifeguard: 0, animator: 0, mechanic: 0 });
    expect(counts[3]).toEqual({ cleaner: 0, lifeguard: 1, animator: 0, mechanic: 0 });
    expect(counts[1]).toEqual({ cleaner: 0, lifeguard: 0, animator: 0, mechanic: 0 });
  });
});
