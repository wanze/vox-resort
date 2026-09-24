import { describe, expect, it } from 'vitest';
import { shoreFor, waterEdgeZ, waterStartZ, type Shore } from '../../layout/domain/shoreline';
import { SAND_LEVEL, SEA_LEVEL, terrainSurfacesFor, type SurfaceGeometry } from './terrainSurface';
import {
  elevationFor,
  levelHeight,
  stepStartZ,
  type Elevation,
  type TerraceSpec,
} from '../../layout/domain/elevation';
import type { ShoreSpec } from '../../layout/domain/shoreline';
import { createTerrain, type TerrainEdit } from '../../layout/domain/terrain';

const TILE = 16;

const shore = (over: Partial<{ inset: number; beach: number; wave: number }> = {}): Shore =>
  shoreFor({
    tilesX: 40,
    tilesZ: 40,
    shore: { inset: 20, beach: 6, wave: 0, seed: 1, ...over },
  })!;

const request = (
  coast: Shore | null,
  reach = 640,
  land: Elevation | null = null,
  edits: readonly TerrainEdit[] = [],
  built: readonly string[] = [],
) => ({
  terrain: createTerrain({ shore: coast, elevation: land, tilesX: 40, tilesZ: 40, edits }),
  isClear: (tileX: number, tileZ: number) => !built.includes(`${tileX},${tileZ}`),
  shore: coast,
  center: { x: 320, z: 320 },
  reach,
  tileVoxels: TILE,
});

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

// Summed off the triangles, not the quads: a mitred half tile's bounding box says a whole tile.
function areaOf(surface: SurfaceGeometry): number {
  let area = 0;
  for (let index = 0; index < surface.indices.length; index += 3) {
    const corner = (vertex: number): readonly [number, number] => {
      const at = surface.indices[index + vertex]! * 3;
      return [surface.positions[at]!, surface.positions[at + 2]!];
    };
    const [ax, az] = corner(0);
    const [bx, bz] = corner(1);
    const [cx, cz] = corner(2);
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return area;
}

function normalsOf(surface: SurfaceGeometry) {
  const normals = surface.normals!;
  return Array.from({ length: surface.quadCount }, (_, quad) => ({
    x: normals[quad * 12]!,
    y: normals[quad * 12 + 1]!,
    z: normals[quad * 12 + 2]!,
  }));
}

// Normal and winding are stored separately and nothing forces them to agree.
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

const NOTHING = { grass: null, sand: null };

describe('terrainSurfacesFor', () => {
  it('draws nothing at all on flat land with no shore', () => {
    expect(terrainSurfacesFor(request(null))).toEqual({
      sea: null,
      water: null,
      ground: NOTHING,
      risers: NOTHING,
    });
  });

  it('builds both surfaces for a plot with a coast', () => {
    const { ground, sea } = terrainSurfacesFor(request(shore()));
    expect(ground.sand?.quadCount).toBeGreaterThan(0);
    expect(sea?.quadCount).toBeGreaterThan(0);
  });

  it('lays each surface flat at its own height', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    // Through a Float32Array and back, so the heights are compared as floats.
    for (const quad of quadsOf(sand!)) expect(quad.y).toBeCloseTo(SAND_LEVEL, 5);
    for (const quad of quadsOf(sea!)) expect(quad.y).toBeCloseTo(SEA_LEVEL, 5);
  });

  it('keeps the sand above the water, so the seam never shows the grass', () => {
    expect(SAND_LEVEL).toBeGreaterThan(SEA_LEVEL);
  });

  it('emits three numbers per vertex and six indices per quad', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    for (const surface of [sand!, sea!]) {
      expect(surface.positions).toHaveLength(surface.quadCount * 4 * 3);
      expect(surface.indices).toHaveLength(surface.quadCount * 6);
    }
  });

  it('winds every quad so it faces up', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
    for (const surface of [sand!, sea!]) {
      for (let index = 0; index < surface.indices.length; index += 3) {
        const at = (vertex: number) => {
          const base = surface.indices[index + vertex]! * 3;
          return [surface.positions[base]!, surface.positions[base + 2]!] as const;
        };
        const [ax, az] = at(0);
        const [bx, bz] = at(1);
        const [cx, cz] = at(2);
        expect((bz - az) * (cx - ax) - (bx - ax) * (cz - az)).toBeGreaterThan(0);
      }
    }
  });

  it('stays inside the box it was asked to cover', () => {
    const {
      ground: { sand },
      sea,
    } = terrainSurfacesFor(request(shore()));
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
    for (const quad of quadsOf(terrainSurfacesFor(request(coast)).ground.sand!)) {
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

  it('hands neighbouring columns the same colour distance at the x they share', () => {
    const sea = terrainSurfacesFor(request(shore({ wave: 3 }))).sea!;
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
    expect(terrainSurfacesFor(request(shore())).ground.sand!.shoreDistances).toBeNull();
  });

  it('runs the water in under the sand, so the seam is an overlap', () => {
    const sea = terrainSurfacesFor(request(shore())).sea!;
    expect(Math.min(...sea.shoreDistances!.edge)).toBeCloseTo(-TILE, 3);
  });
});

describe('the terraces', () => {
  it('draws no raised ground and no slopes on flat land, however much sea', () => {
    const { ground, risers } = terrainSurfacesFor(request(shore()));
    expect({ grass: ground.grass, risers }).toEqual({ grass: null, risers: NOTHING });
  });

  it('draws a bench and a riser for a terraced plot with no sea at all', () => {
    const { ground, risers } = terrainSurfacesFor(request(null, 640, terraced()));
    expect(ground.grass).not.toBeNull();
    expect(risers.grass).not.toBeNull();
  });

  it('lays each bench at its own level and none at sea level', () => {
    const { ground: terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const heights = new Set(quadsOf(terraces.grass!).map((quad) => quad.y));
    expect([...heights].toSorted((a, b) => a - b)).toEqual([levelHeight(1), levelHeight(2)]);
  });

  it('faces every bench straight up', () => {
    const { ground: terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    for (const normal of normalsOf(terraces.grass!)) expect(normal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('slopes every step rather than standing it upright', () => {
    const { risers } = terrainSurfacesFor(request(null, 640, terraced()));
    for (const normal of normalsOf(risers.grass!)) {
      const lean = Math.hypot(normal.x, normal.z);
      expect({ leans: lean > 0.1, tips: normal.y > 0.1 }).toEqual({ leans: true, tips: true });
    }
  });

  it('cuts the slope into the tile above the step, never into the ground below', () => {
    const land = terraced([{ level: 1, inset: 8, wave: 0 }]);
    const { risers } = terrainSurfacesFor(request(null, 640, land));
    const step = stepStartZ(land, 0, 20) * TILE;
    for (const quad of quadsOf(risers.grass!)) {
      expect({ z0: quad.z0 >= step - TILE, z1: quad.z1 <= step }).toEqual({ z0: true, z1: true });
    }
  });

  it('leaves the ground square under anything standing on it', () => {
    const land = terraced([{ level: 1, inset: 8, wave: 0 }]);
    const step = stepStartZ(land, 0, 20);
    const tile = { x: 20, z: step - 1 };
    const bare = terrainSurfacesFor(request(null, 640, land));
    const stood = terrainSurfacesFor(request(null, 640, land, [], [`${tile.x},${tile.z}`]));
    const inTile = (quads: ReturnType<typeof quadsOf>) =>
      quads.filter(
        (quad) =>
          quad.x0 >= tile.x * TILE && quad.x1 <= (tile.x + 1) * TILE && quad.z1 > tile.z * TILE,
      );
    const sloped = inTile(quadsOf(bare.risers.grass!));
    const walls = inTile(quadsOf(stood.risers.grass!));
    expect(sloped.length).toBeGreaterThan(0);
    expect(walls.length).toBeGreaterThan(0);
    expect(Math.max(...walls.map((quad) => quad.z1))).toBe((tile.z + 1) * TILE);
    for (const wall of walls) {
      expect((wall.x1 - wall.x0) * (wall.z1 - wall.z0)).toBe(0);
    }
    const top = inTile(quadsOf(stood.ground.grass!)).filter(
      (quad) => quad.z0 === tile.z * TILE && quad.x0 === tile.x * TILE,
    );
    expect(top).toHaveLength(1);
    expect({ x: top[0]!.x1 - top[0]!.x0, z: top[0]!.z1 - top[0]!.z0 }).toEqual({
      x: TILE,
      z: TILE,
    });
  });

  it('stands the wall under a building upright, on the rim the slopes use', () => {
    const land = terraced([{ level: 1, inset: 8, wave: 0 }]);
    const step = stepStartZ(land, 0, 20);
    const { risers } = terrainSurfacesFor(request(null, 640, land, [], [`20,${step - 1}`]));
    const face = quadsOf(risers.grass!).filter(
      (quad) => quad.x0 >= 20 * TILE && quad.x1 <= 21 * TILE && quad.z0 === step * TILE,
    );
    expect(face.length).toBeGreaterThan(0);
    expect(Math.min(...face.map((quad) => quad.x0))).toBe(20 * TILE);
    expect(Math.max(...face.map((quad) => quad.x1))).toBe(21 * TILE);
    for (const quad of face) expect(quad.z1).toBe(step * TILE);
    const acrossX = normalsOf(risers.grass!).filter((normal) => Math.abs(normal.z) > 0.99);
    expect(acrossX.length).toBeGreaterThan(0);
    for (const normal of acrossX) {
      expect({ upright: Math.abs(normal.y) < 1e-6, z: normal.z }).toEqual({ upright: true, z: 1 });
    }
  });

  it('winds every quad to agree with the normal it carries', () => {
    const { ground: terraces, risers } = terrainSurfacesFor(
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

  it('turns a slope to face the lower ground beside it', () => {
    const { risers } = terrainSurfacesFor(request(null, 640, terraced()));
    const acrossX = normalsOf(risers.grass!).filter((normal) => normal.z !== 0);
    expect(acrossX.length).toBeGreaterThan(0);
    for (const normal of acrossX) expect(normal.z).toBeGreaterThan(0);
  });

  it('turns a slope round where the land falls away inland instead', () => {
    const knoll = terraced([
      { level: 1, inset: 8, wave: 0 },
      { level: 0, inset: 16, wave: 0 },
    ]);
    const { risers } = terrainSurfacesFor(request(null, 640, knoll));
    const facings = new Set(
      normalsOf(risers.grass!)
        .filter((normal) => normal.z !== 0)
        .map((normal) => Math.sign(normal.z)),
    );
    expect([...facings].toSorted()).toEqual([-1, 1]);
  });

  it('spans each bench from one step to the next, with no gap between them', () => {
    const { ground: terraces, risers } = terrainSurfacesFor(request(null, 640, terraced()));
    const column = [...quadsOf(terraces.grass!), ...quadsOf(risers.grass!)]
      .filter((quad) => quad.x0 === 320)
      .toSorted((a, b) => a.z0 - b.z0);
    expect(column.length).toBeGreaterThan(2);
    for (const [index, quad] of column.slice(1).entries()) {
      expect({ index, z0: quad.z0 }).toEqual({ index, z0: column[index]!.z1 });
    }
    const heights = column.map((quad) => quad.y);
    expect(heights).toContain(levelHeight(2));
    expect(heights).toContain(levelHeight(1));
  });

  it('closes the slot a wandering step leaves between two columns', () => {
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

  it('never lets a slope span more than one level, whichever way it falls', () => {
    const wandering = terrainSurfacesFor(
      request(null, 640, terraced([{ level: 1, inset: 8, wave: 2 }])),
    );
    const risers = wandering.risers.grass!;
    for (const quad of quadsOf(risers)) {
      expect({ x: quad.x1 - quad.x0 <= TILE, z: quad.z1 - quad.z0 <= TILE }).toEqual({
        x: true,
        z: true,
      });
    }
    const ys: number[] = [];
    for (let quad = 0; quad < risers.quadCount; quad++) {
      for (let corner = 0; corner < 4; corner++) {
        ys.push(risers.positions[(quad * 4 + corner) * 3 + 1]!);
      }
    }
    expect(new Set(ys)).toEqual(new Set([0, levelHeight(1)]));
  });

  it('keeps every bench clear of the sand, column by column', () => {
    const coast: ShoreSpec = { inset: 20, beach: 6, wave: 3, seed: 1 };
    const wandering = shore({ wave: 3 });
    const withCoast = terraced(
      [
        { level: 1, inset: 10, wave: 2 },
        { level: 2, inset: 20, wave: 2 },
      ],
      coast,
    );
    const { ground: terraces } = terrainSurfacesFor(request(wandering, 640, withCoast));
    const quads = quadsOf(terraces.grass!).filter((quad) => quad.x0 >= 0 && quad.x1 <= 40 * TILE);
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) {
      const tileX = quad.x0 / TILE;
      const grass = (waterStartZ(wandering, tileX) - 6) * TILE;
      expect({ tileX, past: quad.z1 > grass }).toEqual({ tileX, past: false });
    }
  });

  it('draws a bench of sand on the sand mesh and a bench of grass on the grass one', () => {
    const dune = terraced([
      { level: 1, inset: 8, wave: 0, surface: 'sand' },
      { level: 2, inset: 16, wave: 0 },
    ]);
    const { ground: terraces, risers } = terrainSurfacesFor(request(null, 640, dune));
    for (const quad of quadsOf(terraces.sand!)) {
      expect(quad.y).toBeCloseTo(levelHeight(1) + SAND_LEVEL, 5);
    }
    expect(new Set(quadsOf(terraces.grass!).map((quad) => quad.y))).toEqual(
      new Set([levelHeight(2)]),
    );
    expect(risers.sand).not.toBeNull();
    expect(risers.grass).not.toBeNull();
  });

  it('runs the terraces past the plot, the way the beach runs past it', () => {
    const { ground: terraces } = terrainSurfacesFor(request(null, 640, terraced()));
    const quads = quadsOf(terraces.grass!);
    expect(Math.min(...quads.map((quad) => quad.x0))).toBeLessThan(0);
    expect(Math.max(...quads.map((quad) => quad.x1))).toBeGreaterThan(40 * TILE);
  });
});

const channel = (): TerrainEdit[] =>
  Array.from({ length: 8 }, (_, row) => row + 4).flatMap((tileZ) => [
    { tileX: 20, tileZ, level: 0, surface: 'water' as const },
    { tileX: 21, tileZ, level: 0, surface: 'water' as const },
  ]);

describe('ground that was dug rather than grown', () => {
  it('draws a river on its own mesh, not on the sea', () => {
    const { water, sea } = terrainSurfacesFor(request(null, 640, null, channel()));
    expect(water?.quadCount).toBeGreaterThan(0);
    expect(sea).toBeNull();
  });

  it('lays the river flush with the ground it was cut into', () => {
    const { water } = terrainSurfacesFor(request(null, 640, null, channel()));
    for (const quad of quadsOf(water!)) expect(quad.y).toBeCloseTo(SEA_LEVEL, 5);
  });

  it('merges the channel into one quad per column, however long it is', () => {
    const { water } = terrainSurfacesFor(request(null, 640, null, channel()));
    expect(water!.quadCount).toBe(2);
  });

  it('mitres the grass beside a staircase and never the water itself', () => {
    const stair: TerrainEdit[] = [
      { tileX: 20, tileZ: 4, level: 0, surface: 'water' },
      { tileX: 21, tileZ: 4, level: 0, surface: 'water' },
      { tileX: 21, tileZ: 5, level: 0, surface: 'water' },
      { tileX: 22, tileZ: 5, level: 0, surface: 'water' },
    ];
    const { water } = terrainSurfacesFor(request(null, 640, null, stair));
    expect(areaOf(water!)).toBeCloseTo(4 * TILE * TILE + (2 * (TILE * TILE)) / 2, 3);
  });

  it('keeps the sea to itself: a river reaching it is still two surfaces', () => {
    const coast = shore();
    const mouth: TerrainEdit[] = [{ tileX: 20, tileZ: 10, level: 0, surface: 'water' }];
    const { water, sea } = terrainSurfacesFor(request(coast, 640, null, mouth));
    expect(water?.quadCount).toBe(1);
    expect(sea?.quadCount).toBeGreaterThan(0);
  });

  it('banks a lake on a terrace in earth rather than in water', () => {
    const lake: TerrainEdit[] = [{ tileX: 20, tileZ: 2, level: 2, surface: 'water' }];
    const { risers, water } = terrainSurfacesFor(request(null, 640, terraced(), lake));
    expect(water?.quadCount).toBe(1);
    expect(risers.grass).not.toBeNull();
    expect(risers.sand).toBeNull();
  });

  it('draws an island standing out of the bay, with its own risers', () => {
    const coast = shore();
    const water = waterStartZ(coast, 20);
    const island: TerrainEdit[] = [{ tileX: 20, tileZ: water + 2, level: 1, surface: 'sand' }];
    const bare = terrainSurfacesFor(request(coast, 640, null, []));
    const raised = terrainSurfacesFor(request(coast, 640, null, island));
    expect(raised.ground.sand!.quadCount).toBe(bare.ground.sand!.quadCount + 1);
    expect(bare.risers.sand).toBeNull();
    expect(raised.risers.sand!.quadCount).toBeGreaterThan(0);
  });

  it('stands the island on its own level, above the water around it', () => {
    const coast = shore();
    const water = waterStartZ(coast, 20);
    const island: TerrainEdit[] = [{ tileX: 20, tileZ: water + 2, level: 1, surface: 'sand' }];
    const { ground } = terrainSurfacesFor(request(coast, 640, null, island));
    const standing = quadsOf(ground.sand!).filter((quad) => quad.y > levelHeight(1) - 1);
    expect(standing).toHaveLength(1);
    expect(standing[0]!.y).toBeCloseTo(levelHeight(1) + SAND_LEVEL, 5);
  });

  it('fills the corner where two tiles of water only touch diagonally', () => {
    const diagonal: TerrainEdit[] = [
      { tileX: 20, tileZ: 4, level: 0, surface: 'water' },
      { tileX: 21, tileZ: 5, level: 0, surface: 'water' },
    ];
    const { water } = terrainSurfacesFor(request(null, 640, null, diagonal));
    expect(water!.quadCount).toBe(4);
    const halves = quadsOf(water!).filter(
      (quad) => !(quad.x0 === 20 * TILE && quad.z0 === 4 * TILE),
    );
    expect(new Set(halves.map((quad) => `${quad.x0 / TILE},${quad.z0 / TILE}`))).toContain('21,4');
  });

  it('draws an island raised out in the bay, past the plot itself', () => {
    const coast = shore();
    const island: TerrainEdit[] = [{ tileX: 20, tileZ: 45, level: 1, surface: 'sand' }];
    const { ground, risers } = terrainSurfacesFor(request(coast, 640, null, island));
    const standing = quadsOf(ground.sand!).filter((quad) => quad.z0 >= 45 * TILE);
    expect(standing).toHaveLength(1);
    expect(standing[0]!.y).toBeCloseTo(levelHeight(1) + SAND_LEVEL, 5);
    expect(risers.sand).not.toBeNull();
  });

  it('turns a beach tile to grass when that is what it was painted', () => {
    const coast = shore();
    const bare = terrainSurfacesFor(request(coast));
    const turfed = terrainSurfacesFor(
      request(coast, 640, null, [
        { tileX: 20, tileZ: waterStartZ(coast, 20) - 3, level: 0, surface: 'grass' },
      ]),
    );
    const inColumn = (surfaces: ReturnType<typeof terrainSurfacesFor>): number =>
      quadsOf(surfaces.ground.sand!).filter((quad) => quad.x0 === 20 * TILE).length;
    expect(inColumn(bare)).toBe(1);
    expect(inColumn(turfed)).toBe(2);
  });
});
