import { describe, expect, it } from 'vitest';
import { shoreFor, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL, SEA_LEVEL, terrainSurfacesFor, type SurfaceGeometry } from './terrainSurface';

const TILE = 16;

const shore = (over: Partial<{ inset: number; beach: number; wave: number }> = {}): Shore =>
  shoreFor({
    tilesX: 40,
    tilesZ: 40,
    shore: { inset: 20, beach: 6, wave: 0, seed: 1, ...over },
  })!;

/** The middle of a 40x40 plot, with the box reaching a plot's width past it. */
const request = (coast: Shore | null, reach = 640) => ({
  shore: coast,
  center: { x: 320, z: 320 },
  reach,
  tileVoxels: TILE,
});

/** Every quad of a surface, as its own bounding box. */
function quadsOf(surface: SurfaceGeometry) {
  const quads = [];
  for (let quad = 0; quad < surface.quadCount; quad++) {
    const xs = [];
    const zs = [];
    for (let corner = 0; corner < 4; corner++) {
      const at = (quad * 4 + corner) * 3;
      xs.push(surface.positions[at]!);
      zs.push(surface.positions[at + 2]!);
    }
    quads.push({
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      z0: Math.min(...zs),
      z1: Math.max(...zs),
      y: surface.positions[quad * 12 + 1]!,
    });
  }
  return quads;
}

describe('terrainSurfacesFor', () => {
  it('draws nothing at all without a shore', () => {
    expect(terrainSurfacesFor(request(null))).toEqual({ sand: null, sea: null });
  });

  it('builds both surfaces for a plot with a coast', () => {
    const { sand, sea } = terrainSurfacesFor(request(shore()));
    expect(sand?.quadCount).toBeGreaterThan(0);
    expect(sea?.quadCount).toBeGreaterThan(0);
  });

  it('lays each surface flat at its own height', () => {
    const { sand, sea } = terrainSurfacesFor(request(shore()));
    // Through a Float32Array and back, so the heights are compared as floats.
    for (const quad of quadsOf(sand!)) expect(quad.y).toBeCloseTo(SAND_LEVEL, 5);
    for (const quad of quadsOf(sea!)) expect(quad.y).toBeCloseTo(SEA_LEVEL, 5);
  });

  it('keeps the sand above the water, so the seam never shows the grass', () => {
    expect(SAND_LEVEL).toBeGreaterThan(SEA_LEVEL);
  });

  it('emits three numbers per vertex and six indices per quad', () => {
    const { sea } = terrainSurfacesFor(request(shore()));
    expect(sea!.positions).toHaveLength(sea!.quadCount * 4 * 3);
    expect(sea!.colors).toHaveLength(sea!.quadCount * 4 * 3);
    expect(sea!.indices).toHaveLength(sea!.quadCount * 6);
  });

  it('winds every quad so it faces up', () => {
    const { sand, sea } = terrainSurfacesFor(request(shore()));
    for (const surface of [sand!, sea!]) {
      for (let index = 0; index < surface.indices.length; index += 3) {
        const at = (vertex: number) => {
          const base = surface.indices[index + vertex]! * 3;
          return [surface.positions[base]!, surface.positions[base + 2]!] as const;
        };
        const [ax, az] = at(0);
        const [bx, bz] = at(1);
        const [cx, cz] = at(2);
        // The y component of (b - a) x (c - a); positive is a face pointing up.
        expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(0);
      }
    }
  });

  it('stays inside the box it was asked to cover', () => {
    const { sand, sea } = terrainSurfacesFor(request(shore()));
    for (const quad of [...quadsOf(sand!), ...quadsOf(sea!)]) {
      expect(quad.z0).toBeGreaterThanOrEqual(-320);
      expect(quad.z1).toBeLessThanOrEqual(960);
    }
  });

  it('starts the sea on the same tile the layout calls water', () => {
    const coast = shore();
    const columns = new Map<number, number>();
    for (const quad of quadsOf(terrainSurfacesFor(request(coast)).sea!)) {
      columns.set(quad.x0, Math.min(columns.get(quad.x0) ?? Infinity, quad.z0));
    }
    // One tile of underlap, so the water runs in beneath the sand rather than
    // stopping exactly where it does.
    for (let tileX = 10; tileX < 30; tileX++) {
      expect({ tileX, from: columns.get(tileX * TILE) }).toEqual({
        tileX,
        from: (waterStartZ(coast, tileX) - 1) * TILE,
      });
    }
  });

  it('ends the sand exactly where the water begins', () => {
    const coast = shore();
    const columns = new Map<number, number>();
    for (const quad of quadsOf(terrainSurfacesFor(request(coast)).sand!)) {
      columns.set(quad.x0, Math.max(columns.get(quad.x0) ?? -Infinity, quad.z1));
    }
    for (let tileX = 10; tileX < 30; tileX++) {
      expect({ tileX, to: columns.get(tileX * TILE) }).toEqual({
        tileX,
        to: waterStartZ(coast, tileX) * TILE,
      });
    }
  });

  it('covers columns well past the plot, so the coast reaches the horizon', () => {
    const columns = new Set(
      quadsOf(terrainSurfacesFor(request(shore())).sea!).map((quad) => quad.x0),
    );
    // The plot is 40 tiles across and the box reaches 40 tiles past both sides.
    expect(Math.min(...columns)).toBeLessThan(0);
    expect(Math.max(...columns)).toBeGreaterThan(40 * TILE);
  });

  it('gives no two columns quite the same colour', () => {
    const sea = terrainSurfacesFor(request(shore())).sea!;
    const reds = new Set<number>();
    for (let quad = 0; quad < sea.quadCount; quad++) reds.add(sea.colors[quad * 12]!);
    expect(reds.size).toBeGreaterThan(10);
  });
});
