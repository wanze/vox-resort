import { describe, expect, it } from 'vitest';
import { shoreFor, waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL, SEA_LEVEL, terrainSurfacesFor, type SurfaceGeometry } from './terrainSurface';
import {
  elevationFor,
  levelHeight,
  type Elevation,
  type TerraceSpec,
} from '../../layout/domain/elevation';
import type { ShoreSpec } from '../../layout/domain/shoreline';

const TILE = 16;

const shore = (over: Partial<{ inset: number; beach: number; wave: number }> = {}): Shore =>
  shoreFor({
    tilesX: 40,
    tilesZ: 40,
    shore: { inset: 20, beach: 6, wave: 0, seed: 1, ...over },
  })!;

/** The middle of a 40x40 plot, with the box reaching a plot's width past it. */
const request = (coast: Shore | null, reach = 640, land: Elevation | null = null) => ({
  shore: coast,
  elevation: land,
  center: { x: 320, z: 320 },
  reach,
  tileVoxels: TILE,
});

/** Terraces climbing away from the water, on the same 40x40 plot. */
const terraced = (
  terraces: readonly TerraceSpec[] = [
    { level: 1, inset: 8, wave: 0 },
    { level: 2, inset: 16, wave: 0 },
  ],
  coast: ShoreSpec | null = null,
): Elevation =>
  elevationFor({
    tilesX: 40,
    tilesZ: 40,
    ...(coast ? { shore: coast } : {}),
    elevation: { terraces, seed: 1 },
  })!;

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

/** Every quad's normal, one entry per quad. */
function normalsOf(surface: SurfaceGeometry) {
  const normals = surface.normals!;
  return Array.from({ length: surface.quadCount }, (_, quad) => ({
    x: normals[quad * 12]!,
    y: normals[quad * 12 + 1]!,
    z: normals[quad * 12 + 2]!,
  }));
}

/**
 * Whether a quad faces the way its winding says it does.
 *
 * The normal is in the buffer and the winding is in the positions, and nothing
 * forces them to agree — so a quad wound the wrong way round is lit correctly
 * and culled anyway. This is the check that they match.
 */
function windingAgreesWithNormal(surface: SurfaceGeometry, quad: number): boolean {
  const at = (corner: number, axis: number): number =>
    surface.positions[(quad * 4 + corner) * 3 + axis]!;
  const edge = (from: number, to: number): number[] => [
    at(to, 0) - at(from, 0),
    at(to, 1) - at(from, 1),
    at(to, 2) - at(from, 2),
  ];
  const [ax, ay, az] = edge(0, 1) as [number, number, number];
  const [bx, by, bz] = edge(1, 2) as [number, number, number];
  const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const normal = normalsOf(surface)[quad]!;
  return cross[0]! * normal.x + cross[1]! * normal.y + cross[2]! * normal.z > 0;
}

/** What a plot with no terraces contributes on either material. */
const NO_TERRACES = { grass: null, sand: null };

describe('terrainSurfacesFor', () => {
  it('draws nothing at all on flat land with no shore', () => {
    expect(terrainSurfacesFor(request(null))).toEqual({
      sand: null,
      sea: null,
      terraces: NO_TERRACES,
      risers: NO_TERRACES,
    });
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
    const { sand, sea } = terrainSurfacesFor(request(shore()));
    for (const surface of [sand!, sea!]) {
      expect(surface.positions).toHaveLength(surface.quadCount * 4 * 3);
      expect(surface.indices).toHaveLength(surface.quadCount * 6);
    }
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

  it('measures the foam distance off its own column, staircase and all', () => {
    const coast = shore({ wave: 3 });
    const sea = terrainSurfacesFor(request(coast)).sea!;
    expect(sea.shoreDistances!.edge).toHaveLength(sea.quadCount * 4);
    for (const [index, quad] of quadsOf(sea).entries()) {
      const water = waterStartZ(coast, quad.x0 / TILE) * TILE;
      for (let corner = 0; corner < 4; corner++) {
        const vertex = index * 4 + corner;
        const z = sea.positions[vertex * 3 + 2]!;
        expect(sea.shoreDistances!.edge[vertex]).toBeCloseTo(z - water, 3);
      }
    }
  });

  it('measures the colour distance off the coast curve, at each vertex own x', () => {
    const coast = shore({ wave: 3 });
    const sea = terrainSurfacesFor(request(coast)).sea!;
    expect(sea.shoreDistances!.coast).toHaveLength(sea.quadCount * 4);
    for (let vertex = 0; vertex < sea.quadCount * 4; vertex++) {
      const x = sea.positions[vertex * 3]!;
      const z = sea.positions[vertex * 3 + 2]!;
      expect(sea.shoreDistances!.coast[vertex]).toBeCloseTo(
        z - waterEdgeZ(coast, x / TILE) * TILE,
        3,
      );
    }
  });

  /**
   * The seam this whole pair exists to remove: two columns sharing a boundary
   * have to agree on the colour distance there, or the eye sees the step.
   */
  it('hands neighbouring columns the same colour distance at the x they share', () => {
    const sea = terrainSurfacesFor(request(shore({ wave: 3 }))).sea!;
    /** Every colour distance recorded at one (x, z), keyed by the pair. */
    const seen = new Map<string, number[]>();
    for (let vertex = 0; vertex < sea.quadCount * 4; vertex++) {
      const key = `${sea.positions[vertex * 3]},${sea.positions[vertex * 3 + 2]}`;
      seen.set(key, [...(seen.get(key) ?? []), sea.shoreDistances!.coast[vertex]!]);
    }
    const shared = [...seen.values()].filter((distances) => distances.length > 1);
    expect(shared.length).toBeGreaterThan(10);
    for (const distances of shared) {
      expect(Math.max(...distances) - Math.min(...distances)).toBeCloseTo(0, 3);
    }
  });

  it('leaves the sand without shore distances, having no use for them', () => {
    expect(terrainSurfacesFor(request(shore())).sand!.shoreDistances).toBeNull();
  });

  it('runs the water in under the sand, so the seam is an overlap', () => {
    const sea = terrainSurfacesFor(request(shore())).sea!;
    // A tile of underlap, and no more: the sand hides exactly that much water.
    expect(Math.min(...sea.shoreDistances!.edge)).toBeCloseTo(-TILE, 3);
  });
});

describe('the terraces', () => {
  it('draws nothing on flat land, however much sea there is', () => {
    const { terraces, risers } = terrainSurfacesFor(request(shore()));
    expect({ terraces, risers }).toEqual({ terraces: NO_TERRACES, risers: NO_TERRACES });
  });

  it('draws a bench and a riser for a terraced plot with no sea at all', () => {
    // The terraces are independent of the coast: a plot can be terraced without
    // a shore, and the surfaces have to come out either way.
    const { terraces, risers } = terrainSurfacesFor(request(null, 640, terraced()));
    expect(terraces.grass).not.toBeNull();
    expect(risers.grass).not.toBeNull();
  });

  it('lays each bench at its own level and none at sea level', () => {
    // Sea level is the infinite grass plane's job; a quad laid over it would be
    // a second surface at the same height, fighting for the same fragments.
    const { terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const heights = new Set(quadsOf(terraces.grass!).map((quad) => quad.y));
    expect([...heights].toSorted((a, b) => a - b)).toEqual([levelHeight(1), levelHeight(2)]);
  });

  it('faces every bench straight up', () => {
    const { terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    for (const normal of normalsOf(terraces.grass!)) expect(normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('stands every riser upright, never flat', () => {
    // A riser lit as a floor is a riser the sun cannot pick out, which is the
    // whole reason this surface carries normals of its own.
    const { risers } = terrainSurfacesFor(request(null, 640, terraced()));
    for (const normal of normalsOf(risers.grass!)) {
      expect({ y: normal.y, upright: Math.abs(normal.x) + Math.abs(normal.z) }).toEqual({
        y: 0,
        upright: 1,
      });
    }
  });

  it('winds every quad to agree with the normal it carries', () => {
    const { terraces, risers } = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    for (const surface of [terraces.grass!, risers.grass!]) {
      for (let quad = 0; quad < surface.quadCount; quad++) {
        expect({ quad, agrees: windingAgreesWithNormal(surface, quad) }).toEqual({
          quad,
          agrees: true,
        });
      }
    }
  });

  it('turns a riser to face the lower ground beside it', () => {
    // The land climbs inland, so every step's face looks out to sea: +z.
    const { risers } = terrainSurfacesFor(request(null, 640, terraced()));
    const acrossX = normalsOf(risers.grass!).filter((normal) => normal.z !== 0);
    expect(acrossX.length).toBeGreaterThan(0);
    for (const normal of acrossX) expect(normal.z).toBe(1);
  });

  it('turns a riser round where the land falls away inland instead', () => {
    const knoll = terraced([
      { level: 1, inset: 8, wave: 0 },
      { level: 0, inset: 16, wave: 0 },
    ]);
    const { risers } = terrainSurfacesFor(request(null, 640, knoll));
    const facings = new Set(
      normalsOf(risers.grass!)
        .filter((normal) => normal.z !== 0)
        .map((normal) => normal.z),
    );
    // One step up out of the sea and one back down behind it, facing opposite ways.
    expect([...facings].toSorted()).toEqual([-1, 1]);
  });

  it('spans each bench from one step to the next, with no gap between them', () => {
    const { terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const column = quadsOf(terraces.grass!)
      .filter((quad) => quad.x0 === 320)
      .toSorted((a, b) => a.z0 - b.z0);
    expect(column.length).toBe(2);
    // The upper bench runs from the back of the box to the lower bench's start.
    expect(column[0]!.z1).toBe(column[1]!.z0);
    expect(column[0]!.y).toBe(levelHeight(2));
    expect(column[1]!.y).toBe(levelHeight(1));
  });

  it('closes the slot a wandering step leaves between two columns', () => {
    // A straight step rounds to the same tile in every column and needs no
    // closure; a wandering one steps between columns, and each of those steps is
    // a vertical slot at the boundary the two columns share.
    const straight = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 0 }])),
    );
    const wandering = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    const alongZ = (surface: SurfaceGeometry): number =>
      normalsOf(surface).filter((normal) => normal.x !== 0).length;
    expect(alongZ(straight.risers.grass!)).toBe(0);
    expect(alongZ(wandering.risers.grass!)).toBeGreaterThan(0);
  });

  it('never lets a riser span more than one level, whichever axis it closes', () => {
    const wandering = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    // Every closure spans whole tiles and rises exactly one level: a slot deeper
    // than a level would mean two steps had been allowed to meet.
    for (const quad of quadsOf(wandering.risers.grass!)) {
      expect(Number.isInteger((quad.z1 - quad.z0) / TILE)).toBe(true);
    }
    const ys: number[] = [];
    const risers = wandering.risers.grass!;
    for (let quad = 0; quad < risers.quadCount; quad++) {
      for (let corner = 0; corner < 4; corner++) {
        ys.push(risers.positions[(quad * 4 + corner) * 3 + 1]!);
      }
    }
    expect(new Set(ys)).toEqual(new Set([0, levelHeight(1)]));
  });

  it('keeps every bench clear of the sand, column by column', () => {
    // `elevationFor` refuses a step that cuts into the beach; this is the same
    // invariant seen from the geometry, with a coast that wanders under it. A
    // bench overlapping the sand would draw grass over the beach.
    const coast: ShoreSpec = { inset: 20, beach: 6, wave: 3, seed: 1 };
    const wandering = shore({ wave: 3 });
    const withCoast = terraced(
      [
        { level: 1, inset: 10, wave: 2 },
        { level: 2, inset: 20, wave: 2 },
      ],
      coast,
    );
    const { terraces } = terrainSurfacesFor(request(wandering, 640, withCoast));
    const quads = quadsOf(terraces.grass!).filter((quad) => quad.x0 >= 0 && quad.x1 <= 40 * TILE);
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) {
      const tileX = quad.x0 / TILE;
      const grass = (waterStartZ(wandering, tileX) - 6) * TILE;
      expect({ tileX, past: quad.z1 > grass }).toEqual({ tileX, past: false });
    }
  });

  it('draws a bench of sand on the sand mesh and a bench of grass on the grass one', () => {
    // A dune is sand four metres up. Drawn on the grass mesh it is a lawn where
    // the beach should have carried on, which is the whole reason the two are
    // separate surfaces.
    const dune = terraced([
      { level: 1, inset: 8, wave: 0, surface: 'sand' },
      { level: 2, inset: 16, wave: 0 },
    ]);
    const { terraces, risers } = terrainSurfacesFor(request(null, 640, dune));
    expect(new Set(quadsOf(terraces.sand!).map((quad) => quad.y))).toEqual(
      new Set([levelHeight(1)]),
    );
    expect(new Set(quadsOf(terraces.grass!).map((quad) => quad.y))).toEqual(
      new Set([levelHeight(2)]),
    );
    // A riser is made of the bench above it: the dune's own face is sand, the
    // cut up to the lawn behind it is not.
    expect(risers.sand).not.toBeNull();
    expect(risers.grass).not.toBeNull();
  });

  it('runs the terraces past the plot, the way the beach runs past it', () => {
    const { terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const quads = quadsOf(terraces.grass!);
    expect(Math.min(...quads.map((quad) => quad.x0))).toBeLessThan(0);
    expect(Math.max(...quads.map((quad) => quad.x1))).toBeGreaterThan(40 * TILE);
  });
});
